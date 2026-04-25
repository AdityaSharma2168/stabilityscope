import type Redis from "ioredis"
import type { SupabaseClient } from "@supabase/supabase-js"

import { logger } from "../../lib/logger"
import {
  logApiCallEnd,
  logCacheCheck,
  redisGetJson,
  redisSetJson,
  resolveNewsApiKey,
  respectNewsApiRateLimit,
  sleep,
} from "./common"

const PROVIDER = "newsapi" as const
const CACHE_TTL_SEC = 15 * 60

const newsCacheKey = (ticker: string) => `news:${ticker.toUpperCase()}`

const newsInflight = new Map<
  string,
  Promise<{ articles: CompanyNewsArticle[]; partial: boolean }>
>()

export type NewsCredibilityTier = 1 | 2 | 3

export type CompanyNewsArticle = {
  title: string
  description: string
  source: string
  publishedAt: string
  url: string
  credibilityTier: NewsCredibilityTier
  credibilityWeight: number
}

export type NewsApiRawPayload = {
  status: string
  totalResults?: number
  articles?: NewsApiArticleRaw[]
  message?: string
  /** e.g. rateLimited, apiKeyInvalid */
  code?: string
}

type NewsApiArticleRaw = {
  source?: { id?: string | null; name?: string | null }
  author?: string | null
  title?: string | null
  description?: string | null
  url?: string | null
  publishedAt?: string | null
  content?: string | null
}

type CachedNewsWrapper = {
  raw: NewsApiRawPayload
  fetchedAt: string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function normalizeHeadline(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/** Jaccard similarity on word tokens (0–1). */
export function headlineSimilarity(a: string, b: string): number {
  const wa = new Set(normalizeHeadline(a))
  const wb = new Set(normalizeHeadline(b))
  if (wa.size === 0 || wb.size === 0) return 0
  let inter = 0
  for (const w of wa) {
    if (wb.has(w)) inter += 1
  }
  const union = wa.size + wb.size - inter
  return union === 0 ? 0 : inter / union
}

function classifySourceTier(sourceName: string): { tier: NewsCredibilityTier; weight: number } {
  const n = sourceName.toLowerCase()

  const tier1Patterns = [
    "reuters",
    "bloomberg",
    "wall street journal",
    "wsj",
    "financial times",
    "ft.com",
    "cnbc",
  ]
  if (tier1Patterns.some((p) => n.includes(p))) {
    return { tier: 1, weight: 1.5 }
  }

  const tier3Patterns = [
    "blog",
    "substack",
    "medium",
    "reddit",
    "forum",
    "youtube",
  ]
  if (tier3Patterns.some((p) => n.includes(p))) {
    return { tier: 3, weight: 0.5 }
  }

  if (n.includes("seeking alpha") || n.includes("seekingalpha")) {
    return { tier: 2, weight: 1.0 }
  }

  // Known national / trade press → tier 2
  if (n.length > 3 && sourceName !== "Unknown") {
    return { tier: 2, weight: 1.0 }
  }

  return { tier: 3, weight: 0.5 }
}

function dedupeArticles(raw: NewsApiArticleRaw[]): NewsApiArticleRaw[] {
  const kept: NewsApiArticleRaw[] = []
  const titles: string[] = []
  for (const a of raw) {
    const title = typeof a.title === "string" ? a.title : ""
    if (!title.trim()) continue
    const dup = titles.some((t) => headlineSimilarity(t, title) > 0.8)
    if (dup) continue
    titles.push(title)
    kept.push(a)
  }
  return kept
}

function toCompanyNewsArticle(a: NewsApiArticleRaw): CompanyNewsArticle {
  const sourceName =
    typeof a.source?.name === "string" && a.source.name.trim()
      ? a.source.name.trim()
      : "Unknown"
  const { tier, weight } = classifySourceTier(sourceName)
  return {
    title: typeof a.title === "string" ? a.title : "",
    description: typeof a.description === "string" ? a.description : "",
    source: sourceName,
    publishedAt: typeof a.publishedAt === "string" ? a.publishedAt : new Date().toISOString(),
    url: typeof a.url === "string" ? a.url : "",
    credibilityTier: tier,
    credibilityWeight: weight,
  }
}

function parseNewsApiJson(text: string): NewsApiRawPayload | null {
  try {
    const data = JSON.parse(text) as unknown
    if (!isRecord(data)) return null
    return data as unknown as NewsApiRawPayload
  } catch {
    return null
  }
}

function isNewsRateLimitedHttp(status: number): boolean {
  return status === 429
}

function isNewsRateLimitedBody(payload: NewsApiRawPayload | null): boolean {
  if (!payload) return false
  if (payload.code === "rateLimited") return true
  const m = (payload.message ?? "").toLowerCase()
  return m.includes("rate limit") || m.includes("too many requests")
}

async function fetchNewsLive(
  redis: Redis,
  supabase: SupabaseClient,
  userId: string,
  ticker: string,
  companyName: string,
  days: number,
): Promise<{ articles: CompanyNewsArticle[]; partial: boolean }> {
  const key = newsCacheKey(ticker)
  const cachedUnknown = await redisGetJson(redis, key)
  if (
    cachedUnknown &&
    typeof cachedUnknown === "object" &&
    cachedUnknown !== null &&
    "raw" in cachedUnknown
  ) {
    logCacheCheck(key, true)
    const cached = cachedUnknown as CachedNewsWrapper
    const deduped = dedupeArticles(cached.raw.articles ?? [])
    return {
      articles: deduped.map(toCompanyNewsArticle),
      partial: cached.raw.status !== "ok",
    }
  }

  logCacheCheck(key, false)

  const apiKey = await resolveNewsApiKey(supabase, userId)
  if (!apiKey) {
    logger.error({ action: "error", provider: PROVIDER, ticker, message: "Missing NewsAPI key" })
    return { articles: [], partial: true }
  }

  const from = new Date()
  from.setDate(from.getDate() - days)
  const fromStr = from.toISOString().slice(0, 10)

  const url = new URL("https://newsapi.org/v2/everything")
  url.searchParams.set("q", `"${companyName}"`)
  url.searchParams.set("language", "en")
  url.searchParams.set("sortBy", "publishedAt")
  url.searchParams.set("from", fromStr)
  url.searchParams.set("pageSize", "100")

  const started = Date.now()

  const requestOnce = () =>
    fetch(url.toString(), {
      method: "GET",
      headers: { "X-Api-Key": apiKey },
      cache: "no-store",
    })

  try {
    await respectNewsApiRateLimit()
    let res = await requestOnce()
    let text = await res.text()
    let payload = parseNewsApiJson(text)

    if (isNewsRateLimitedHttp(res.status) || isNewsRateLimitedBody(payload)) {
      await sleep(3_000)
      await respectNewsApiRateLimit()
      res = await requestOnce()
      text = await res.text()
      payload = parseNewsApiJson(text)
    }

    if (!payload || payload.status !== "ok") {
      await logApiCallEnd(redis, PROVIDER, ticker, started, false)
      logger.error({
        action: "error",
        provider: PROVIDER,
        ticker,
        message: payload?.message ?? "NewsAPI invalid response",
      })
      return { articles: [], partial: true }
    }

    await logApiCallEnd(redis, PROVIDER, ticker, started, true)

    const wrapper: CachedNewsWrapper = {
      raw: payload,
      fetchedAt: new Date().toISOString(),
    }
    await redisSetJson(redis, key, wrapper, CACHE_TTL_SEC)

    const deduped = dedupeArticles(payload.articles ?? [])
    return {
      articles: deduped.map(toCompanyNewsArticle),
      partial: false,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logApiCallEnd(redis, PROVIDER, ticker, started, false)
    logger.error({ action: "error", provider: PROVIDER, ticker, message: msg })
    return { articles: [], partial: true }
  }
}

export async function getCompanyNews(
  redis: Redis,
  supabase: SupabaseClient,
  userId: string,
  ticker: string,
  companyName: string,
  days = 30,
): Promise<{ articles: CompanyNewsArticle[]; partial: boolean }> {
  const key = newsCacheKey(ticker)
  const cachedUnknown = await redisGetJson(redis, key)
  if (
    cachedUnknown &&
    typeof cachedUnknown === "object" &&
    cachedUnknown !== null &&
    "raw" in cachedUnknown
  ) {
    logCacheCheck(key, true)
    const cached = cachedUnknown as CachedNewsWrapper
    const deduped = dedupeArticles(cached.raw.articles ?? [])
    return {
      articles: deduped.map(toCompanyNewsArticle),
      partial: cached.raw.status !== "ok",
    }
  }

  const inflightKey = `${userId}:${ticker.toUpperCase()}:${days}`
  let pending = newsInflight.get(inflightKey)
  if (!pending) {
    pending = fetchNewsLive(redis, supabase, userId, ticker, companyName, days).finally(() => {
      newsInflight.delete(inflightKey)
    })
    newsInflight.set(inflightKey, pending)
  }
  return pending
}
