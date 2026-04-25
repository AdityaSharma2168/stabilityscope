# StabilityScope — Backend Integration Plan (Cursor Context)

## Project Overview

StabilityScope is a stability scoring platform for publicly traded companies. Users submit a ticker and within 60 seconds receive a Stability Score (0-100), a segment classification, dimensional breakdown, top signals, and a counterfactual scenario. The system combines structured financial data with unstructured news signals, processes them through a background worker queue, caches results, and persists everything in Postgres.

**The frontend is 100% complete** — all pages, components, charts, auth UI, loading states, and empty states are built with mock data. Every data hook has `// TODO: Replace with Supabase/API call` markers. The job now is to wire up the full backend: Supabase (auth + database), Redis (queue + cache), BullMQ (worker), external APIs (Tiingo, NewsAPI, SerpAPI/Google Trends), scoring algorithm, and observability.

## Non-Negotiable Requirements (from spec)

1. **Decoupled workers** — background queue (Redis/BullMQ). User submits ticker, gets job ID, polls for completion. Worker does the heavy lifting.
2. **State management** — Postgres (Supabase) to track users, inputs, structured outputs.
3. **Dockerized** — `docker-compose up` runs everything locally. Production uses same container images.
4. **Real auth** — Email/password via Supabase Auth. Evaluators will create new accounts.
5. **Multi-tenant** — Any user signs up, enters their own API keys, gets their own scores. Nothing hardcoded.
6. **Persistent database** — Supabase Postgres. No in-memory state or JSON files.
7. **Queue-based architecture** — BullMQ + Redis. API outage or rate limit must not crash the pipeline.
8. **Caching layer** — Redis cache in front of read API. Demonstrate cache hits vs misses in logs.
9. **Observability** — Structured logs (Pino), basic metrics (latency, error rate, queue depth, cache hit rate).
10. **Deployed on AWS** — EC2 with docker-compose. Same images as local.

## DO NOT (from spec)

- Mock or cache data permanently (must run live)
- Train a classifier on stock returns
- Use an LLM as the 0-100 rater (bounded sub-tasks only — sentiment extraction, explanation generation)
- Equal-weight dimensions without justification
- Conflate news volume with severity
- Segment by composite thirds

## What's Already Built (DO NOT modify unless necessary)

### Pages (in app/(app)/)
- `dashboard/page.tsx` — Ticker search, quick-access pills, market overview, recent scores
- `score/[ticker]/page.tsx` — Full score detail: gauge, summary, counterfactual, dimensions, signals, timeline, validation, processing info
- `watchlist/page.tsx` — Saved tickers with scores, sorting, add/remove
- `history/page.tsx` — Past analyses with search, pagination, cache indicators
- `settings/page.tsx` — Profile, 3 API key fields (Tiingo, NewsAPI, Google Trends), preferences

### Auth Pages (in app/(auth)/)
- `login/page.tsx` — Email/password login
- `signup/page.tsx` — Registration with name, email, password

### Key Components
- `score/validation-section.tsx` — Confidence, Sensitivity, Historical Benchmark cards
- `score/score-loading.tsx` — Animated processing pipeline (5 steps)
- `score/dimension-radar.tsx` — 6-axis radar chart
- `score/news-timeline.tsx` — Sentiment area chart + headlines
- `score/signals-section.tsx` — Positive/negative signal cards
- `score/counterfactual-card.tsx` — Score projection card
- `shared/score-gauge.tsx` — SVG semicircular gauge
- `providers/auth-provider.tsx` — Auth context with mock login/signup/logout

### Hooks (in hooks/) — THESE ARE WHAT YOU'LL MODIFY
Every hook has `// TODO: Replace with Supabase/API call` markers.

- `use-recent-scores.ts` — Returns `{ scores, isLoading }`
- `use-score-detail.ts` — Returns `{ score, isLoading, refresh }`
- `use-watchlist.ts` — Returns `{ items, isLoading, addTicker, removeTicker }`
- `use-history.ts` — Returns `{ entries, isLoading }`
- `use-settings.ts` — Returns `{ apiKeys, preferences, isLoading, saveKeys, savePreferences, testConnection }`

### Types (in lib/types.ts)
```typescript
StabilityScore {
  ticker, companyName, exchange, score, segment, summary,
  counterfactual: Counterfactual,
  analyzedAt, processingTime, cacheHit?,
  dimensions: Dimension[],  // 6 dimensions
  signals: { positive: Signal[], negative: Signal[] },
  newsTimeline: NewsPoint[],
  confidence: Confidence,
  sensitivity: Sensitivity,
  historicalBenchmark: HistoricalBenchmark
}
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Next.js App Router, Tailwind, shadcn/ui, Recharts
- **Auth**: Supabase Auth (email/password)
- **Database**: Supabase Postgres
- **Queue**: BullMQ + Redis
- **Cache**: Redis (same instance as queue, different key prefix)
- **Financial API**: Tiingo (REST, header auth)
- **News API**: NewsAPI.org
- **Trends API**: SerpAPI (Google Trends data)
- **LLM**: OpenAI (bounded sub-tasks ONLY — sentiment extraction, explanation generation, counterfactual text)
- **Logging**: Pino (structured JSON logs)
- **Deployment**: Docker + docker-compose + AWS EC2

---

## DATABASE SCHEMA

```sql
-- Users are managed by Supabase Auth (auth.users table)
-- We add a profiles table for app-specific user data

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User-specific API keys (multi-tenant)
CREATE TABLE user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'tiingo', 'newsapi', 'serpapi', 'openai'
  api_key TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Score results (the main output)
CREATE TABLE scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  company_name TEXT NOT NULL,
  exchange TEXT,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  segment TEXT NOT NULL,
  summary TEXT NOT NULL,
  counterfactual JSONB NOT NULL,
  dimensions JSONB NOT NULL,        -- Array of Dimension objects
  signals JSONB NOT NULL,           -- { positive: Signal[], negative: Signal[] }
  news_timeline JSONB NOT NULL,     -- Array of NewsPoint objects
  confidence JSONB NOT NULL,
  sensitivity JSONB NOT NULL,
  historical_benchmark JSONB NOT NULL,
  processing_time_ms INTEGER,
  cache_hit BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Job tracking
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  progress JSONB DEFAULT '{"step": 0, "message": "Queued"}',
  result_id UUID REFERENCES scores(id),
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Watchlist (per-user)
CREATE TABLE watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  company_name TEXT NOT NULL,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ticker)
);

-- User preferences
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cache_ttl_minutes INTEGER DEFAULT 15,
  auto_refresh_watchlist BOOLEAN DEFAULT TRUE,
  score_alert_threshold INTEGER DEFAULT 50,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_scores_user_ticker ON scores(user_id, ticker);
CREATE INDEX idx_scores_user_created ON scores(user_id, created_at DESC);
CREATE INDEX idx_jobs_user ON jobs(user_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_watchlist_user ON watchlist(user_id);
CREATE INDEX idx_user_api_keys_user ON user_api_keys(user_id);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users see own profiles" ON profiles FOR ALL USING (id = auth.uid());
CREATE POLICY "Users see own keys" ON user_api_keys FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users see own scores" ON scores FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users see own jobs" ON jobs FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users see own watchlist" ON watchlist FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users see own preferences" ON user_preferences FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

---

## ARCHITECTURE FLOW

```
User enters ticker on frontend
       ↓
POST /api/score { ticker } (authenticated)
       ↓
API route checks Redis cache (key: `score:{user_id}:{ticker}`)
       ↓ cache hit → return cached score immediately (mark cacheHit: true)
       ↓ cache miss ↓
Creates row in `jobs` table (status: 'queued')
Adds job to BullMQ queue with { jobId, userId, ticker }
Returns { jobId } to frontend
       ↓
Frontend polls GET /api/jobs/:jobId every 2 seconds
       ↓
BullMQ Worker picks up job:
  Step 1: Resolve ticker → company name (Tiingo /tiingo/utilities/search)
  Step 2: Fetch financial data (Tiingo /tiingo/fundamentals/{ticker}/statements — income, balance, cash flow)
  Step 3: Fetch news articles (NewsAPI — last 30 days for this company)
  Step 4: Fetch Google Trends data (SerpAPI — 90 day interest)
  Step 5: Compute each dimension score:
    - Earnings Stability (financial): EPS variance over last 8 quarters
    - Debt Health (financial): D/E ratio vs sector median
    - Cash Flow Resilience (financial): FCF / total debt
    - Sentiment Momentum (sentiment): weighted avg sentiment with recency decay
    - Controversy Exposure (sentiment): severity-weighted negative article count
    - Public Interest Trend (sentiment): Google Trends trajectory vs baseline
  Step 6: Apply weighted aggregation → composite score (0-100)
  Step 7: Run segmentation logic → assign segment
  Step 8: Call OpenAI for:
    - Summary text generation (bounded sub-task)
    - Counterfactual scenario generation (bounded sub-task)
    - Sensitivity analysis (remove highest-impact signal, recompute)
    - Historical benchmark comparison (bounded sub-task)
  Step 9: Build full StabilityScore object
  Step 10: Insert into `scores` table
  Step 11: Cache in Redis with TTL from user preferences
  Step 12: Update `jobs` row (status: 'completed', result_id)
  Throughout: Update job.progress JSONB after each step
       ↓
Frontend poll sees status: 'completed', fetches /api/scores/:id
       ↓
Dashboard renders full score detail page
```

---

## SCORING ALGORITHM DETAIL

### Dimensions (6 total, weighted sum = 1.0)

| # | Dimension | Category | Weight | Source | Computation | Justification |
|---|-----------|----------|--------|--------|-------------|---------------|
| 1 | Earnings Stability | financial | 0.22 | Tiingo | Standard deviation of quarterly EPS over last 8 quarters, inverted and normalized to 0-100 | Consistent earnings = core stability signal. High variance indicates unpredictability. |
| 2 | Debt Health | financial | 0.18 | Tiingo | Debt-to-equity ratio, normalized against sector median. Lower = better. | Overleveraged companies are fragile to rate changes and revenue dips. |
| 3 | Cash Flow Resilience | financial | 0.18 | Tiingo | Free cash flow / total debt. Higher = better. Normalized to 0-100. | Ability to service obligations regardless of earnings volatility. |
| 4 | Sentiment Momentum | sentiment | 0.17 | NewsAPI | Exponentially weighted moving average of article sentiments over 30 days. Recent articles weighted 3x vs older. Sentiment scored by OpenAI per article (bounded sub-task). | Captures trend direction, not just current level. Recency decay prevents stale news from anchoring. |
| 5 | Controversy Exposure | sentiment | 0.15 | NewsAPI | Count of articles mentioning leadership, lawsuits, regulatory action, weighted by source credibility (tier 1/2/3) and severity. Normalized inversely. | Directly measures reputational risk. Source weighting prevents low-quality outlets from skewing. |
| 6 | Public Interest Trend | sentiment | 0.10 | SerpAPI | Google Trends search interest over 90 days, compared to sector average. Rising = slight positive, stable = neutral, declining = negative. | Captures retail/public attention trends that precede sentiment shifts. |

### Normalization
All dimensions are min-max normalized to 0-100 within their respective distributions. For financial dimensions, we use sector-relative normalization (comparing against tech, healthcare, etc. medians). For sentiment dimensions, we use absolute scales (sentiment ranges from -1 to +1, mapped to 0-100).

### Composite Score
```
score = Σ(dimension_score × dimension_weight)
```
Weighted sum, not equal weight. Weights are justified by each dimension's predictive relevance to stability.

### Segmentation (4 clusters)
Based on financial vs sentiment disagreement:

```
financial_avg = avg(earnings_stability, debt_health, cashflow_resilience)
sentiment_avg = avg(sentiment_momentum, controversy_exposure, public_interest)

if financial_avg >= 60 AND sentiment_avg >= 60:
  → "Fundamentally Strong, Reputationally Clean"
elif financial_avg >= 60 AND sentiment_avg < 60:
  → "Financially Strong, Reputation Declining"
elif financial_avg < 60 AND sentiment_avg >= 60:
  → "Financially Weak, Sentiment Propped"
else:
  → "Distressed"
```

### Robustness Rules
- No single article can change the score by more than 5 points (cap per-article impact)
- If a data source fails, compute with remaining sources and reduce confidence to "medium" or "low"
- Sentiment uses median instead of mean to resist outliers
- News is deduplicated by headline similarity (>80% match = skip)
- Source credibility tiers: Tier 1 (Reuters, Bloomberg, WSJ) = 1.5x weight, Tier 2 (industry press) = 1.0x, Tier 3 (blogs, forums) = 0.5x

---

## DOCKER SETUP

### Dockerfile (Next.js app)
```dockerfile
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

### docker-compose.yml
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - REDIS_URL=redis://redis:6379
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - redis
    restart: unless-stopped

  worker:
    build: .
    command: ["node", "worker/index.js"]
    environment:
      - SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - REDIS_URL=redis://redis:6379
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped

volumes:
  redis-data:
```

---

## REDIS KEY STRUCTURE

```
Cache keys:
  score:{user_id}:{ticker}         → Full StabilityScore JSON (TTL from user prefs)
  tiingo:{ticker}                  → Tiingo raw response (search + statements + prices, TTL: 1 hour)
  news:{ticker}                    → NewsAPI raw response (TTL: 15 min)
  trends:{ticker}                  → SerpAPI raw response (TTL: 1 hour)
  company:{ticker}                 → Company name + exchange lookup (TTL: 24 hours)

Queue:
  bull:scoring:*                   → BullMQ internal keys

Metrics:
  metrics:cache_hits               → Counter
  metrics:cache_misses             → Counter
  metrics:jobs_completed           → Counter
  metrics:jobs_failed              → Counter
  metrics:avg_processing_time      → Running average
```

---

## API ROUTES NEEDED

```
POST   /api/auth/signup          → Create account via Supabase Auth
POST   /api/auth/login           → Login via Supabase Auth
POST   /api/auth/logout          → Logout

POST   /api/score                → Submit ticker for scoring → returns { jobId }
GET    /api/jobs/:id             → Poll job status + progress
GET    /api/scores/:id           → Get completed score by ID
GET    /api/scores/recent        → Get user's recent scores
GET    /api/scores/history       → Get user's full history with pagination

GET    /api/watchlist            → Get user's watchlist
POST   /api/watchlist            → Add ticker to watchlist
DELETE /api/watchlist/:ticker    → Remove from watchlist

GET    /api/settings/keys        → Get user's API key status (not values)
POST   /api/settings/keys        → Save/update API keys
POST   /api/settings/keys/test   → Test a specific API key
GET    /api/settings/preferences → Get user preferences
POST   /api/settings/preferences → Save preferences

GET    /api/metrics              → Observability metrics (public or API-key protected)
GET    /api/health               → Health check
```

---

## OBSERVABILITY

### Pino Logger Setup
```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
```

### What to Log (structured)
- Every API request: `{ method, path, userId, statusCode, durationMs }`
- Every cache check: `{ action: 'cache_check', key, hit: true/false }`
- Every external API call: `{ action: 'api_call', provider, ticker, durationMs, success }`
- Every job lifecycle: `{ action: 'job_start|job_step|job_complete|job_fail', jobId, ticker, step, durationMs }`
- Every dimension computation: `{ action: 'dimension_computed', dimension, score, rawValue }`
- Errors: `{ action: 'error', error: message, stack, context }`

### Metrics Endpoint (GET /api/metrics)
Returns JSON:
```json
{
  "uptime_seconds": 3600,
  "cache": { "hits": 142, "misses": 58, "hit_rate": 0.71 },
  "jobs": { "completed": 58, "failed": 2, "avg_processing_ms": 14200, "queue_depth": 0 },
  "external_apis": {
    "tiingo": { "calls": 58, "avg_ms": 2100, "errors": 1 },
    "newsapi": { "calls": 58, "avg_ms": 1800, "errors": 0 },
    "serpapi": { "calls": 58, "avg_ms": 1200, "errors": 3 }
  }
}
```

---

## CRITICAL RULES FOR ALL PHASES

1. **NEVER add `any` types.** Use `unknown` with type guards.
2. **NEVER modify view or component files** unless absolutely necessary.
3. **Keep the same hook return interfaces.** Components call hooks — if the interface changes, components break.
4. **Always add try/catch** around external calls. Log errors with Pino.
5. **Multi-tenant everything.** Every query must filter by `user_id`. Every insert must include `user_id`.
6. **Test after every phase** by running `docker-compose up` and clicking through.
7. **Commit after every phase** with a descriptive message.
8. **Keep mock data files** for reference.
9. **LLM is for bounded sub-tasks ONLY** — sentiment scoring per article, summary generation, counterfactual text. NOT for computing the 0-100 score.
10. **Cache raw API responses in Redis** to avoid hitting rate limits on repeated lookups.
