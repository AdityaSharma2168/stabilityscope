# StabilityScope

A multi-tenant **company-stability scoring platform**. Enter a DOW 30 ticker, and within ~15-30 seconds you get a 0-100 stability score backed by real financials (Tiingo), real news (NewsAPI), real public-attention data (SerpAPI / Google Trends), and bounded LLM analysis (OpenAI) — segmented, dimension-decomposed, sensitivity-tested, and historically benchmarked.

The frontend is Next.js (App Router) + Tailwind + shadcn/ui. The backend is a queue-based pipeline running BullMQ workers on Redis, persisted in Supabase Postgres, observable through structured Pino logs and `/api/metrics`, and deployed end-to-end on Railway via Docker.

https://stabilityscope-production.up.railway.app/login

> Built as a take-home for Nomila. The full assignment context lives in [`CURSOR_CONTEXT_STABILITY.md`](./CURSOR_CONTEXT_STABILITY.md).

---

## Table of contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Scoring methodology](#scoring-methodology)
- [Scope cuts & trade-offs](#scope-cuts--trade-offs)
- [Edge cases handled](#edge-cases-handled)
- [Tech stack](#tech-stack)
- [Local development](#local-development)
- [Deployment](#deployment)
- [Environment variables](#environment-variables)
- [API reference](#api-reference)
- [Caching strategy](#caching-strategy)
- [Observability](#observability)
- [Validation harness](#validation-harness)
- [Project layout](#project-layout)
- [Database schema](#database-schema)
- [Known limitations / future work](#known-limitations--future-work)

---

## What it does

A user signs up, drops their own provider keys (Tiingo, NewsAPI, SerpAPI, OpenAI) into the Settings page, picks a ticker from the DOW 30, and the system:

1. Resolves the ticker to a company name + sector via Tiingo.
2. Pulls the last 8 quarters of fundamentals (income, balance sheet, cash flow).
3. Pulls the last 30 days of company news from NewsAPI.
4. Pulls 90 days of Google Trends data via SerpAPI.
5. Per-article sentiment is rated by OpenAI as a **bounded sub-task** (each call returns a single number in `[-1, 1]`, batched 10 at a time, individually cached).
6. Six independent dimensions are computed deterministically from those raw signals.
7. A weighted composite score (0-100) is produced, the company is segmented into one of four buckets, and a sensitivity sweep removes each signal one at a time to verify no single article moves the score by more than 5 points.
8. OpenAI is called three more times — also bounded — to produce a plain-English summary, a counterfactual, and a comparison to historical benchmarks. **It is never used to compute the 0-100 score.**
9. The result is cached in Redis (TTL is per-user, default 15 min), persisted in Postgres, and the frontend pulls it.

Cache hits are returned in under a second and explicitly flagged in the UI. A Refresh button bypasses the cache.

---

## Architecture

```
Browser
   │
   ▼
Next.js App Router (web service on Railway)
  ├─ React 19 frontend (server components + client hooks)
  ├─ /api/score, /api/jobs/:id, /api/scores/:id …
  └─ Supabase Auth (email/password, RLS-gated)
   │
   ├─────────────► Supabase Postgres
   │                profiles · jobs · scores · user_api_keys
   │                user_preferences · watchlist
   │
   ├─────────────► Redis (BullMQ + cache + metrics)
   │                bull:scoring:*           (queue)
   │                score:v4:{userId}:{TKR}  (StabilityScore JSON)
   │                tiingo:{TKR}             (raw fundamentals)
   │                news:{TKR}               (raw NewsAPI)
   │                trends:{TKR}             (raw SerpAPI)
   │                sentiment:{hash}         (per-article OpenAI)
   │                metrics:cache_hits/_misses, jobs_*, api_*…
   │
   └─ enqueues BullMQ job → "scoring" queue
                     │
                     ▼
        BullMQ Worker (separate Railway service, same Docker image)
          worker/index.ts
            ├─ resolve_company    → Tiingo /utilities/search
            ├─ fetch_financial    → Tiingo /fundamentals/<tkr>/statements
            ├─ fetch_news         → NewsAPI /everything
            ├─ score_sentiment    → OpenAI (bounded, batched, cached)
            ├─ fetch_trends       → SerpAPI Google Trends
            ├─ compute_dimensions → deterministic math
            ├─ generate_analysis  → OpenAI summary/counterfactual/benchmark
            ├─ persist_score      → Supabase
            └─ cache_score        → Redis
```

Each step runs through a `runStep()` wrapper that emits `job_step_start` / `job_step` / `job_step_fail` Pino logs with timing, so a single grep over the worker logs reconstructs the full lifecycle of any job.

The worker is intentionally **decoupled** — the API route does not block on scoring. It either returns a cache hit immediately or returns a `jobId` the frontend polls. A NewsAPI rate-limit, an OpenAI 500, or a Tiingo `403` does not crash anything — the offending step is logged and the dimension that depended on it falls back to a neutral baseline with reduced confidence.

---

## Scoring methodology

The score is a **weighted sum of six independent dimensions**. Weights sum to 1.0 and are justified by each dimension's predictive relevance to stability — they're not equal-weight.

| # | Dimension | Category | Weight | Source | Computation |
|---|---|---|---|---|---|
| 1 | **Earnings Stability** | financial | 0.22 | Tiingo | σ of quarterly EPS over the last 8 quarters, normalized by a sector-calibrated `maxExpectedSigma` through a piecewise-linear curve (`r ≤ 0.3 → 80+`, `r ≈ 0.5 → 50`, `r ≥ 1.5 → 0`). |
| 2 | **Debt Health** | financial | 0.18 | Tiingo | D/E ratio compared to sector median (tech: 1.5, financials: 2.5, energy: 1.6, …). Negative equity → score = 10. |
| 3 | **Cash Flow Resilience** | financial | 0.18 | Tiingo | FCF / total debt; ratio of 0.5 maps to a perfect 100. Zero debt → 100, negative FCF → 0. |
| 4 | **Sentiment Momentum** | sentiment | 0.17 | NewsAPI + OpenAI | EWMA of per-article sentiment with 0.9/day decay, 3× boost on the past 7 days, weighted by source credibility. Daily values are reduced via **median, not mean**, so one viral hit-piece can't dominate. |
| 5 | **Controversy Exposure** | sentiment | 0.15 | NewsAPI | Severity × source-credibility for articles matching leadership / litigation / regulatory keyword sets. Capped at the top 5 most impactful articles per ticker. |
| 6 | **Public Interest Trend** | sentiment | 0.10 | SerpAPI | Linear-regression slope of Google Trends interest over 90 days, normalized by mean. Rising → 60-80, stable → ~50, declining → 20-40. |

### Composite

```
composite = Σ (dimension_score × dimension_weight)
```

### Segmentation (4 buckets, not composite-thirds)

```
financial_avg = avg(earnings_stability, debt_health, cashflow_resilience)
sentiment_avg = avg(sentiment_momentum, controversy_exposure, public_interest)

financial_avg ≥ 60 ∧ sentiment_avg ≥ 60 → "Fundamentally Strong, Reputationally Clean"
financial_avg ≥ 60 ∧ sentiment_avg <  60 → "Financially Strong, Reputation Declining"
financial_avg <  60 ∧ sentiment_avg ≥ 60 → "Financially Weak, Sentiment Propped"
otherwise                                → "Distressed"
```

Segmentation explicitly captures **disagreement** between fundamentals and reputation, which is the interesting axis — not just "low / mid / high score".

### Robustness rules

- **No single article can shift the score by more than 5 points.** Per-signal `impact` is capped to `±5` before persistence (`MAX_PER_SIGNAL_IMPACT` in `worker/scoring/composite.ts`). This is also asserted post-hoc by the sensitivity sweep.
- **Sentiment uses median, not mean.** Resists outliers and one-off articles.
- **Source credibility tiers.** Tier-1 (Reuters, Bloomberg, WSJ) gets 1.5× weight; Tier-3 (blogs / forums) gets 0.5×.
- **Article cap.** Controversy reads the top 5 most impactful articles only; nothing past that contributes.
- **Graceful degradation.** A failed source falls back to a neutral baseline (50 or 60 depending on dimension) and the overall confidence drops to "medium" / "low".
- **Pipeline versioning.** `SCORE_PIPELINE_VERSION` in `lib/score-cache-key.ts` is baked into every cache key — bumping it invalidates all stale blobs without flushing Redis.

### Why OpenAI is *never* the rater

Per the spec, the LLM only handles bounded sub-tasks:

- Per-article sentiment rating ∈ `[-1, 1]` (one number per article, batched 10 at a time, cached 7 days).
- Plain-English summary generation given the already-computed dimensions.
- Counterfactual scenario generation.
- Historical-benchmark comparison.

The 0-100 score itself is pure deterministic math over the six dimensions, so it's reproducible, auditable, and can be sensitivity-tested.

---

## Scope cuts & trade-offs

### 1. DOW 30 only

> **Tiingo's free fundamentals tier (`/tiingo/fundamentals/<tkr>/statements`) only covers the DOW 30.**

The full fundamentals endpoint is what powers the three financial dimensions, so without it the score would collapse to just sentiment + trends. Rather than ship something that lies about its coverage, every input surface (the dashboard search box, the API route, the autocomplete, the watchlist) **rejects anything outside the DOW 30** with a clear error message. The authoritative list lives in [`lib/dow30.ts`](./lib/dow30.ts).

**Production fix:** swap the Tiingo fundamentals call for FMP (`/api/v3/income-statement/<tkr>`, `/balance-sheet-statement`, `/cash-flow-statement`) or upgrade to a paid Tiingo plan. Only `worker/apis/tiingo.ts` would need to change — the dimension code is provider-agnostic.

### 2. McDonald's (and other "low news volume" tickers) edge case

NewsAPI's free tier returns recent news, but defensively-managed brands like **MCD** and **KO** routinely have weeks where there is essentially no business-relevant coverage. When that happens:

- Sentiment Momentum falls back to score = 50 (neutral, partial flag set).
- Controversy Exposure falls back to score = 60 (mildly cautious baseline, partial flag set).
- Confidence drops to "medium".
- The summary text and the UI explicitly note "limited recent coverage" instead of inventing signal.

The same path is taken if NewsAPI is rate-limited or returns a 5xx. **Empty news ≠ score = 0.** This was an early bug — the system used to score MCD `~38` because a couple of stale "anti-McDonald's" blog posts dominated the empty distribution. The fix was the median-with-credibility-weights aggregation plus the fallback policy described above.

### 3. Tiingo symbol search occasionally returns no name

For some DOW 30 tickers, `/tiingo/utilities/search?query=<TKR>` returns an empty array (notably **MCD** at certain hours). The worker now falls back to the local `DOW30` array in `lib/dow30.ts` for the company name and sets `partial: true` so confidence is reduced. Without this fallback, the UI used to display "MCD (unresolved)".

### 4. No real-time prices

The system pulls daily-bar prices from Tiingo as auxiliary context but **does not score on price action**. Per the spec, training a classifier on stock returns is explicitly off-limits — stability is meant to be orthogonal to price.

### 5. Cache TTL tension

Default cache TTL is 15 minutes (per-user, configurable from Settings). This is a deliberate trade-off:

- Too short → every search hits NewsAPI / Tiingo / OpenAI and burns the user's keys.
- Too long → news that just broke isn't reflected in the score for an hour.

Fifteen minutes is short enough that "Refresh" is rarely needed and long enough to keep cost under control on the free tiers. The Refresh button on the score detail page sends `force: true` to bypass the cache when needed.

### 6. OpenAI cost containment

- Per-article sentiment is **batched 10 at a time** in a single chat completion (one prompt, ten ratings back).
- Each individual sentiment is **cached for 7 days** keyed by URL hash, so repeated tickers don't re-rate the same articles.
- Summary / counterfactual / benchmark calls are also cached 7 days keyed by `(score, segment, dimensions)` so re-running the same ticker with unchanged dimensions returns the cached prose.
- Model is `gpt-4o-mini` for sentiment (cheap, latency-friendly) and `gpt-4o` for the long-form analysis (one call each).

A cold scoring run on a ticker with no warm caches costs roughly $0.01-0.02 in OpenAI usage. A warm run is free.

### 7. Single Redis for queue + cache + metrics

BullMQ's queue, the score cache, the per-provider raw caches, and the observability counters all live in one Redis instance with key-prefix discipline. In production you'd separate them (different DBs at minimum) so a flush of stale cache entries doesn't accidentally nuke in-flight jobs. For a one-evening deploy on Railway's free Redis, one instance is fine.

### 8. tsx at runtime in production

The worker runs `tsx worker/index.ts` directly inside the Docker container rather than pre-compiling to JS. This was a deliberate trade-off:

- Pro: zero build-step drift between local and prod, no JS source-map gymnastics.
- Con: tsx adds ~150ms of boot time and a small per-require overhead.

Worth it for a single-worker setup. For a fleet of workers you'd `tsc` to a `dist/` folder and run plain `node`.

### 9. No watchlist auto-refresh

The watchlist UI shows the last persisted score per ticker, but it does **not** automatically re-run them on a schedule. A cron-style refresher (BullMQ scheduled jobs) is a clean addition, but punted.

### 10. Two services on Railway, no horizontal scaling

The setup runs one web service and one worker service. BullMQ supports horizontal worker scaling out of the box (just bump the worker service replica count) but it's not configured by default — `SCORING_WORKER_CONCURRENCY=1` per worker process keeps API rate-limits well under the free tier ceilings.

---

## Edge cases handled

| Edge case | Behavior |
|---|---|
| Ticker not in DOW 30 | Rejected at the API layer with `400 "Ticker not supported. Only DOW 30 companies are available."` |
| Tiingo `/utilities/search` returns empty | Fall back to `DOW30` lookup in `lib/dow30.ts` for the name, `partial: true` |
| Tiingo `403` (key revoked / over quota) | Auth-circuit-breaker: `authBlocked=true` cached for 1 h, future calls skip the network |
| Tiingo returns non-JSON | Treated as a fail, logged, financial dimensions go partial |
| Income statement has < 4 quarters | Earnings Stability still computes from what's there but flags `partial: true` and lowers confidence |
| Negative equity | Debt Health → score = 10 (not crash, not skip) |
| Zero debt | Cash Flow Resilience → score = 100 with rawValue `"FCF X / debt ~0"` |
| NewsAPI returns 0 articles | Sentiment & Controversy fall back to neutral baselines, confidence → medium |
| Article missing `publishedAt` | Treated as `now` for decay, weight reduced |
| SerpAPI down or returns < 3 points | Public Interest Trend → 50, partial flag, confidence reduced |
| OpenAI 5xx during sentiment batch | Per-article sentiment defaults to 0, batch logged as failed, scoring continues |
| Same ticker submitted twice in 100ms (React Strict Mode dev double-fire) | `inflightSubmissions` Map in `hooks/use-score-detail.ts` dedupes — only one `POST /api/score` actually fires |
| Score cache hit on `/api/score` | Returns `cacheHit: true` immediately, no job created, no worker invocation |
| `force: true` on `/api/score` | Cache bypassed, new job always queued |
| Scoring pipeline version bumped | All previously-cached score blobs are ignored automatically (key includes `v{N}`) |
| Worker crashes mid-job | BullMQ retries; if all retries fail, `jobs.status = 'failed'`, `metrics:jobs_failed` increments, error message persisted |
| Supabase env vars missing during `next build` | `lib/supabase-server.ts` and `lib/supabase-client.ts` lazy-init via `Proxy` so the build doesn't crash at module load |
| `next build` without `NEXT_PUBLIC_*` vars | Dockerfile uses `ARG` + `ENV` to forward Railway service vars into the build stage |
| Stale `worker/index.js` running instead of `worker/index.ts` | Deleted; `docker-compose` and Railway both run `tsx worker/index.ts` explicitly |

---

## Tech stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript 5.7, Tailwind CSS v4, shadcn/ui, Recharts, Lucide
- **Auth:** Supabase Auth (email/password) with `@supabase/ssr`
- **Database:** Supabase Postgres with RLS (every row is `user_id`-scoped)
- **Queue:** BullMQ 5 on Redis 7 (ioredis client)
- **Cache:** Same Redis instance, key-prefix separated
- **Worker runtime:** `tsx` executes TypeScript source directly
- **Logging:** Pino (structured JSON) with `pino-pretty` in dev
- **External APIs:** Tiingo (financials), NewsAPI.org (news), SerpAPI (Google Trends), OpenAI (`gpt-4o-mini` for sentiment, `gpt-4o` for analysis)
- **Validation:** Zod for runtime input checks; custom `worker/validation/` for sensitivity sweep + historical-benchmark assertions
- **Container:** Multi-stage Dockerfile (Alpine, pnpm, Next.js standalone output)
- **Hosting:** Railway (web + worker services share the image, Redis plugin, Supabase external)

---

## Local development

### Prerequisites

- Node 20.x
- pnpm 9.x (`corepack enable && corepack prepare pnpm@latest --activate`)
- Docker + Docker Compose (for Redis at minimum, ideally for everything)
- A Supabase project (free tier is fine)
- API keys: Tiingo, NewsAPI.org, SerpAPI, OpenAI

### 1. Clone & install

```bash
git clone https://github.com/AdityaSharma2168/stabilityscope.git
cd stabilityscope
pnpm install
```

### 2. Apply the database schema

Open the SQL editor in your Supabase project and paste the schema from [`CURSOR_CONTEXT_STABILITY.md`](./CURSOR_CONTEXT_STABILITY.md#database-schema). It defines `profiles`, `user_api_keys`, `scores`, `jobs`, `watchlist`, `user_preferences`, all indexes, and all RLS policies.

### 3. Configure environment

```bash
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#         SUPABASE_SERVICE_ROLE_KEY, REDIS_URL, OPENAI_API_KEY
# optionally TIINGO_API_KEY / NEWSAPI_API_KEY for worker fallback in dev
```

See [Environment variables](#environment-variables) below for the full list.

### 4. Run it

**Option A — `docker-compose` (closest to prod):**

```bash
docker-compose up --build
# web at http://localhost:3000, worker + Redis run alongside
```

**Option B — local Node + Dockered Redis:**

```bash
docker-compose up redis -d            # just Redis
pnpm dev                              # Next.js dev server, hot reload
pnpm worker:dev                       # worker with `tsx watch`, hot reload
```

The first ticker scored will take 15-30s (real cache miss). Subsequent searches for the same ticker should return in well under a second.

### 5. Add API keys via the UI

Sign up, go to **Settings**, paste the four provider keys, hit Save. They're stored in `user_api_keys` keyed by `(user_id, provider)`. The "Test connection" button hits each provider's lightest endpoint to confirm the key is valid.

---

## Deployment

The app is currently deployed on **Railway** with three services:

1. **Web** — runs the Dockerfile's default `CMD` (`node server.js`, the Next.js standalone server).
2. **Worker** — same image, custom Start Command: `node_modules/.bin/tsx worker/index.ts`.
3. **Redis** — Railway's official Redis plugin, referenced from both web and worker via `REDIS_URL`.

### Railway-specific gotchas

- **Build args.** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be **service variables on the web service**, not just runtime env vars. Railway passes service vars matching `ARG` declarations into the Docker build automatically. Without this, `next build` inlines empty strings into the client bundle and the browser can't reach Supabase.
- **Start command on the worker service** must override the Dockerfile `CMD`. The Dockerfile's default is the web server.
- **Same Redis on both services.** Use Railway's "Add Reference" feature so both `REDIS_URL` values point at the Redis plugin's `${{Redis.REDIS_URL}}`.
- **Supabase URL Configuration.** Add `https://<your-app>.up.railway.app/**` to **Authentication → URL Configuration → Redirect URLs** so magic links / OAuth callbacks don't bounce to localhost.

### Other platforms

The same Dockerfile + `docker-compose.yml` works on AWS (ECS / EC2), Fly.io, and Render with no code changes. The `worker` and `app` services in `docker-compose.yml` are the canonical reference.

---

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Web (build + runtime) | Supabase project URL, inlined into client bundle |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Web (build + runtime) | Anon key for browser Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | Web + Worker (runtime) | Service-role key, bypasses RLS for API routes and worker writes |
| `SUPABASE_URL` | Worker | Same URL as `NEXT_PUBLIC_SUPABASE_URL`; either works |
| `REDIS_URL` | Web + Worker | Used by ioredis + BullMQ |
| `OPENAI_API_KEY` | Worker | Fallback when user hasn't saved a key in Settings |
| `TIINGO_API_KEY` | Worker | Fallback for dev / demo accounts |
| `NEWSAPI_API_KEY` | Worker | Fallback for dev / demo accounts |
| `SERPAPI_API_KEY` | Worker | Fallback for dev / demo accounts |
| `LOG_LEVEL` | Both | Pino level (`debug`, `info`, `warn`, `error`) |
| `SCORING_WORKER_CONCURRENCY` | Worker | BullMQ concurrency, capped at 3 |
| `NODE_ENV` | Both | `production` is set automatically in Docker |

In multi-tenant mode the per-user keys in `user_api_keys` always take precedence over the worker's fallback env keys.

---

## API reference

All routes (except `/api/health` and `/api/metrics`) require a valid Supabase session cookie. Every route is wrapped in `withLogging()` which emits `http_request` Pino lines with `{ method, path, status, durationMs }`.

| Route | Method | Description |
|---|---|---|
| `/api/score` | `POST` | Body `{ ticker, force? }`. Cache hit → return full `StabilityScore`. Miss → enqueue job, return `{ jobId }`. |
| `/api/jobs/:id` | `GET` | Poll job status: `queued` / `processing` / `completed` / `failed`, plus `progress.{step,message}` and `result_id` when done. |
| `/api/scores/:id` | `GET` | Fetch a persisted `StabilityScore` by id. |
| `/api/scores/recent` | `GET` | The current user's last N scores. |
| `/api/scores/history` | `GET` | Paginated history with optional ticker / segment filters. |
| `/api/watchlist` | `GET` / `POST` / `DELETE` | List / add / remove tickers. |
| `/api/settings/keys` | `GET` / `POST` / `DELETE` | Read presence-only metadata, save, or delete provider keys. |
| `/api/settings/keys/test` | `POST` | Body `{ provider }`. Hits the provider's cheapest endpoint to verify the key. |
| `/api/settings/preferences` | `GET` / `POST` | Read / write `cache_ttl_minutes`, `auto_refresh_watchlist`, `score_alert_threshold`. |
| `/api/validate` | `POST` | Body `{ ticker }`. Re-runs sensitivity sweep + historical-benchmark check on the latest persisted score. |
| `/api/health` | `GET` | **Public.** Pings Supabase + Redis. Returns `{ status: "healthy", supabase, redis, uptime }`. |
| `/api/metrics` | `GET` | **Public.** Returns the JSON metrics blob — see [Observability](#observability). |

---

## Caching strategy

All cache I/O goes through `lib/cache.ts` so every read emits a structured `cache_check` log and increments either `metrics:cache_hits` or `metrics:cache_misses`.

| Key shape | Contents | TTL |
|---|---|---|
| `score:v{N}:{userId}:{TKR}` | Full `StabilityScore` JSON | User pref (default 15 min) |
| `tiingo:{TKR}` | Search + statements + prices bundle | 1 hour |
| `news:{TKR}` | Raw NewsAPI payload | 15 min |
| `trends:{TKR}` | Raw SerpAPI payload | 1 hour |
| `sentiment:{hash(url)}` | OpenAI sentiment per article | 7 days |
| `analysis:{kind}:{TKR}:{hash}` | OpenAI summary / counterfactual / benchmark | 7 days |
| `bull:scoring:*` | BullMQ internal | (BullMQ-managed) |
| `metrics:*` | Counters and accumulators | (no TTL — counters) |

The `v{N}` prefix on score keys is `SCORE_PIPELINE_VERSION` — bump it in `lib/score-cache-key.ts` whenever the scoring algorithm changes meaningfully and every previously-cached score is automatically ignored.

`invalidateCache()` uses `SCAN`, never `KEYS`, so it doesn't block Redis on large keyspaces.

---

## Observability

### Pino logs

Every request, every external API call, every worker step, every dimension computation, every cache check is a structured JSON line:

```json
{"level":"info","action":"job_step","jobId":"...","ticker":"AAPL","step":"fetch_news","durationMs":1820,"time":"..."}
{"level":"info","action":"dimension_computed","dimension":"Earnings Stability","score":74,"rawValue":"σ 0.59 (n=8, max σ=1)","weight":0.22,"time":"..."}
{"level":"info","action":"cache_check","key":"tiingo:AAPL","hit":true,"time":"..."}
{"level":"info","action":"http_request","method":"POST","path":"/api/score","status":202,"durationMs":12,"time":"..."}
```

`grep` over the logs reconstructs everything:

```bash
# everything that happened in one job
rg '"jobId":"<job-id>"' logs.json

# every cache miss in the last run
rg '"action":"cache_check","key":"score:.*","hit":false' logs.json

# slowest external API calls
rg '"action":"api_call"' logs.json | jq 'select(.durationMs > 3000)'
```

### `/api/metrics`

Public JSON endpoint returning live counters from Redis:

```json
{
  "uptime_seconds": 3600,
  "cache": { "hits": 142, "misses": 58, "hit_rate": 0.71 },
  "jobs": {
    "completed": 58,
    "failed": 2,
    "queue_depth": 0,
    "avg_processing_ms": 14200
  },
  "external_apis": {
    "tiingo":  { "calls": 58, "avg_ms": 2100, "errors": 1 },
    "newsapi": { "calls": 58, "avg_ms": 1800, "errors": 0 },
    "serpapi": { "calls": 58, "avg_ms": 1200, "errors": 3 },
    "openai":  { "calls": 232, "avg_ms": 740, "errors": 0 }
  }
}
```

### `/api/health`

Public endpoint that pings Supabase (lightweight `head` query) and Redis (`PING`). Returns `200` with `{ status: 'healthy', supabase: true, redis: true, uptime }` or `503` with the failing component called out.

Both endpoints make this easy to wire into Railway's health-check, or UptimeRobot / Better Stack, without giving them shell access.

---

## Validation harness

Two layers of validation live in `worker/validation/`. Neither runs at request time — they're for manual sanity-checking and the demo walkthrough.

### Sensitivity sweep — `worker/validation/sensitivity.ts`

`runSensitivityAnalysis(score, signals, dimensionInputs)` does two passes:

1. **Per-signal pass.** For each news signal, drop it, recompute the score, assert that the delta is `≤ MAX_PER_SIGNAL_IMPACT` (5 points). Any violation is added to the report.
2. **Per-dimension pass.** Drop each dimension one at a time, recompute the composite. Financial dimensions are uncapped (a missing earnings signal *should* move the score significantly). Sentiment dimensions are bounded by their weight × 100.

The full report is returned in the API and rendered in the score detail page's "Sensitivity" card.

### Historical benchmarks — `worker/validation/historical-cases.ts`

A static catalog of known stress / stability events:

| Ticker | Period | Expected | Description |
|---|---|---|---|
| `WE` | Q3 2019 | 10-30 | WeWork pre-IPO collapse |
| `SIVB` | Feb 2023 | 15-35 | SVB pre-March 2023 run |
| `AAPL` | Q4 2023 | 70-95 | Apple stable period |
| `TSLA` | Q4 2022 | 30-55 | Tesla Twitter turmoil |

`POST /api/validate { ticker }` fetches the current persisted score for a ticker, runs both checks, and returns:

```json
{
  "sensitivityReport": { "violations": [], "perDimensionDeltas": [...] },
  "historicalCheck": {
    "matched": true,
    "ticker": "AAPL",
    "period": "Q4 2023",
    "expectedRange": [70, 95],
    "actualScore": 82,
    "withinRange": true
  }
}
```

These are not runtime gates — a score outside the expected range still ships. They're a calibration tool for the demo and for catching regressions on a known set of fixtures.

---

## Project layout

```
.
├─ app/
│   ├─ (app)/                  Authenticated routes
│   │   ├─ dashboard/          Ticker search, quick-access pills, recent scores
│   │   ├─ score/[ticker]/     Full score detail (gauge, dimensions, signals, …)
│   │   ├─ history/            Past analyses with cache-hit badges
│   │   ├─ watchlist/          Saved tickers
│   │   └─ settings/           Profile, API keys, preferences
│   ├─ (auth)/                 Login + signup
│   ├─ api/
│   │   ├─ score/              POST → cache or enqueue
│   │   ├─ jobs/[id]/          GET → poll status
│   │   ├─ scores/             GET id, recent, history
│   │   ├─ watchlist/          GET/POST/DELETE
│   │   ├─ settings/           keys, keys/test, preferences
│   │   ├─ validate/           POST → sensitivity + benchmark
│   │   ├─ metrics/            GET (public)
│   │   └─ health/             GET (public)
│   └─ layout.tsx, page.tsx, globals.css
├─ components/                 React components (shadcn/ui + custom)
│   ├─ score/                  gauge, radar, signals, news timeline, validation card
│   ├─ shared/                 score-gauge, score-pill, …
│   ├─ providers/              auth-provider
│   └─ ui/                     shadcn/ui primitives
├─ hooks/                      use-score-detail, use-watchlist, use-settings, …
├─ lib/
│   ├─ cache.ts                getCached / setCache / invalidateCache + key builder
│   ├─ logger.ts               Pino instance
│   ├─ redis.ts                ioredis singleton
│   ├─ queue.ts                BullMQ queue ("scoring")
│   ├─ supabase-server.ts      Lazy-init service-role client (Proxy)
│   ├─ supabase-client.ts      Lazy-init anon client (Proxy)
│   ├─ auth-helpers.ts         Server-side session helpers
│   ├─ api-logging.ts          withLogging() route wrapper
│   ├─ score-cache-key.ts      SCORE_PIPELINE_VERSION + key builder
│   ├─ dow30.ts                Authoritative DOW 30 list + lookups
│   └─ types.ts                Shared types (StabilityScore, Dimension, Signal, …)
├─ worker/
│   ├─ index.ts                BullMQ worker, runStep(), full pipeline
│   ├─ apis/                   tiingo, newsapi, serpapi, common (rate limits, key resolution)
│   ├─ scoring/                dimensions, composite, sentiment, analysis (LLM bounded sub-tasks)
│   └─ validation/             sensitivity, historical-cases
├─ data/                       Mock data (kept for reference, no longer used at runtime)
├─ Dockerfile                  Multi-stage: deps → builder (with NEXT_PUBLIC ARGs) → runner
├─ docker-compose.yml          web + worker + redis
├─ .dockerignore
├─ CURSOR_CONTEXT_STABILITY.md Original assignment context
└─ README.md                   you are here
```

---

## Database schema

Full SQL (tables, indexes, RLS policies) lives in [`CURSOR_CONTEXT_STABILITY.md`](./CURSOR_CONTEXT_STABILITY.md#database-schema). High-level shape:

- **`profiles`** — extends `auth.users` with `full_name`.
- **`user_api_keys`** — `(user_id, provider)` unique. Stores the user's Tiingo / NewsAPI / SerpAPI / OpenAI keys.
- **`user_preferences`** — `cache_ttl_minutes`, `auto_refresh_watchlist`, `score_alert_threshold`.
- **`jobs`** — one row per submitted scoring run. `status`, `progress` (jsonb), `result_id`, `error`.
- **`scores`** — the persisted output. All structured fields (`dimensions`, `signals`, `news_timeline`, `confidence`, `sensitivity`, `historical_benchmark`, `counterfactual`) are jsonb.
- **`watchlist`** — `(user_id, ticker)` unique.

Every table has RLS enabled with a single `user_id = auth.uid()` policy. The web service uses the anon key + the user's session JWT (so RLS applies); the worker uses the service-role key (bypasses RLS, but always filters by `user_id` defensively).

---

## Known limitations / future work

Things explicitly punted, in rough priority order:

- **Beyond DOW 30.** Wire FMP into `worker/apis/` behind the same interface as `tiingo.ts`. The dimension code is provider-agnostic.
- **Scheduled watchlist refresh.** BullMQ supports cron jobs; one queue tick per ticker per day would be enough.
- **Historical price-volatility dimension.** Tiingo daily prices are already pulled and cached but not yet scored — this could be a 7th dimension or feed Earnings Stability indirectly.
- **Per-source credibility tuning.** Currently a hand-rolled tier mapping in `worker/apis/newsapi.ts`. Could be moved to a config file or learned from historical agreement with major-outlet sentiment.
- **Worker horizontal scaling on Railway.** Bump replicas + raise `SCORING_WORKER_CONCURRENCY`. Confirm no race conditions on shared rate-limit state (currently process-local).
- **End-to-end tests.** A Playwright suite that signs up, adds keys, scores AAPL, asserts the score persists and the cache flips on the second run.
- **Pre-compile worker for prod.** `tsc` to `dist/`, run plain `node`. Drops boot time and tsx dependency.
- **Webhook on score-completion.** Push a Server-Sent Event from the API rather than polling `/api/jobs/:id` every 2 seconds.
- **Audit log of dimension computations.** Currently each computation is logged but not persisted to Postgres. A flat audit table would let you graph dimension drift per ticker over time.

---

## License

Private / unlicensed — built as a take-home assessment. If you'd like to use any part of it, open an issue.
