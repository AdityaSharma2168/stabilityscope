import type Redis from "ioredis"
import type { SupabaseClient } from "@supabase/supabase-js"

import { logger } from "../../lib/logger"

export type ApiProvider = "tiingo" | "newsapi" | "serpapi" | "openai"

export async function getUserApiKey(
  supabase: SupabaseClient,
  userId: string,
  provider: ApiProvider,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_api_keys")
    .select("api_key")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle()

  if (error) {
    logger.error({
      action: "error",
      context: "getUserApiKey",
      provider,
      error: error.message,
    })
    return null
  }
  return data?.api_key ?? null
}

/** DB key first; then `TIINGO_API_KEY` for local/dev (worker loads `.env.local`). */
export async function resolveTiingoKey(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const fromDb = await getUserApiKey(supabase, userId, "tiingo")
  if (fromDb?.trim()) return fromDb.trim()
  const fromEnv = process.env.TIINGO_API_KEY?.trim()
  return fromEnv || null
}

/** DB key first; then `OPENAI_API_KEY`. */
export async function resolveOpenAIKey(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const fromDb = await getUserApiKey(supabase, userId, "openai")
  if (fromDb?.trim()) return fromDb.trim()
  const fromEnv = process.env.OPENAI_API_KEY?.trim()
  return fromEnv || null
}

/** DB key first; then `NEWSAPI_API_KEY` or `NEWS_API_KEY`. */
export async function resolveNewsApiKey(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const fromDb = await getUserApiKey(supabase, userId, "newsapi")
  if (fromDb?.trim()) return fromDb.trim()
  return (
    process.env.NEWSAPI_API_KEY?.trim() ||
    process.env.NEWS_API_KEY?.trim() ||
    null
  )
}

export async function incrementApiCalls(redis: Redis, provider: ApiProvider): Promise<void> {
  await redis.incr(`metrics:api_calls:${provider}`)
}

export async function incrementApiErrors(redis: Redis, provider: ApiProvider): Promise<void> {
  await redis.incr(`metrics:api_errors:${provider}`)
}

export async function logApiCallEnd(
  redis: Redis,
  provider: ApiProvider,
  ticker: string,
  startedAt: number,
  success: boolean,
): Promise<void> {
  const durationMs = Date.now() - startedAt
  logger.info({ action: "api_call", provider, ticker, durationMs, success })
  await incrementApiCalls(redis, provider)
  if (!success) {
    await incrementApiErrors(redis, provider)
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Minimum spacing between Tiingo HTTP calls. Tiingo free tier is generous
 *  (50 req/hr + 1000/day) but we still space requests modestly to be polite. */
export const TIINGO_MIN_INTERVAL_MS = 250

/** Minimum spacing between NewsAPI HTTP calls (developer tier: avoid burst 429s). */
export const NEWSAPI_MIN_INTERVAL_MS = 1_200

let lastNewsApiRequestAt = 0

export async function respectNewsApiRateLimit(): Promise<void> {
  const now = Date.now()
  const elapsed = now - lastNewsApiRequestAt
  if (lastNewsApiRequestAt > 0 && elapsed < NEWSAPI_MIN_INTERVAL_MS) {
    await sleep(NEWSAPI_MIN_INTERVAL_MS - elapsed)
  }
  lastNewsApiRequestAt = Date.now()
}
