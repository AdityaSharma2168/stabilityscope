import { logger } from "./logger"
import { redis } from "./redis"
import { SCORE_PIPELINE_VERSION } from "./score-cache-key"

/**
 * Centralized Redis cache layer for the whole app.
 *
 * Every read goes through {@link getCached} so we get one structured Pino log
 * (`cache_check`) and one metrics counter increment (`cache_hits` /
 * `cache_misses`) per access — no matter where the cache is consumed.
 *
 * Every write goes through {@link setCache} so TTLs and JSON serialization are
 * uniform.
 *
 * Cache key conventions (see {@link cacheKey}):
 *   score:v{N}:{userId}:{TICKER}    StabilityScore JSON, TTL = user pref
 *   tiingo:{TICKER}                 Tiingo bundle (search/statements/prices), 1h
 *   news:{TICKER}                   NewsAPI raw payload, 15m
 *   trends:{TICKER}                 SerpAPI raw payload, 1h
 *   sentiment:{hash}                Per-article OpenAI sentiment, 7d
 *   analysis:{kind}:{TICKER}:{hash} Per-score OpenAI analysis blob, 7d
 */

const CACHE_HITS_KEY = "metrics:cache_hits"
const CACHE_MISSES_KEY = "metrics:cache_misses"

export async function getCached<T>(key: string): Promise<T | null> {
  let raw: string | null = null
  try {
    raw = await redis.get(key)
  } catch (err) {
    logger.error({
      action: "error",
      context: "cache_get",
      key,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }

  const hit = raw !== null
  logger.info({ action: "cache_check", key, hit })
  await redis
    .incr(hit ? CACHE_HITS_KEY : CACHE_MISSES_KEY)
    .catch(() => undefined)

  if (!hit) return null
  try {
    return JSON.parse(raw as string) as T
  } catch (err) {
    logger.warn({
      action: "cache_parse_failed",
      key,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export async function setCache(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const ttl = Math.max(1, Math.floor(ttlSeconds))
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttl)
    logger.info({ action: "cache_set", key, ttl })
  } catch (err) {
    logger.error({
      action: "error",
      context: "cache_set",
      key,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Drop a single key. Convenience around `redis.del` so callers don't need to
 * import the raw client.
 */
export async function deleteCache(key: string): Promise<void> {
  try {
    await redis.del(key)
    logger.info({ action: "cache_delete", key })
  } catch (err) {
    logger.error({
      action: "error",
      context: "cache_delete",
      key,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Invalidate by glob pattern (e.g. `score:v3:{userId}:*`). Uses SCAN under the
 * hood — never KEYS — so it doesn't block Redis on large keyspaces.
 */
export async function invalidateCache(pattern: string): Promise<number> {
  let cursor = "0"
  let removed = 0
  try {
    do {
      const [next, batch] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        500,
      )
      cursor = next
      if (batch.length > 0) {
        await redis.del(...batch)
        removed += batch.length
      }
    } while (cursor !== "0")
    logger.info({ action: "cache_invalidate", pattern, removed })
    return removed
  } catch (err) {
    logger.error({
      action: "error",
      context: "cache_invalidate",
      pattern,
      error: err instanceof Error ? err.message : String(err),
    })
    return removed
  }
}

/** Single source of truth for cache key shapes. */
export const cacheKey = {
  score(userId: string, ticker: string): string {
    return `score:v${SCORE_PIPELINE_VERSION}:${userId}:${ticker.toUpperCase()}`
  },
  scoreUserPattern(userId: string): string {
    return `score:v${SCORE_PIPELINE_VERSION}:${userId}:*`
  },
  tiingo(ticker: string): string {
    return `tiingo:${ticker.toUpperCase()}`
  },
  news(ticker: string): string {
    return `news:${ticker.toUpperCase()}`
  },
  trends(ticker: string): string {
    return `trends:${ticker.toUpperCase()}`
  },
}

export type CacheKeyBuilder = typeof cacheKey
