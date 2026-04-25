import type Redis from "ioredis"
import type { SupabaseClient } from "@supabase/supabase-js"

import { logger } from "../../lib/logger"
import {
  getUserApiKey,
  logApiCallEnd,
  logCacheCheck,
  redisGetJson,
  redisSetJson,
} from "./common"

const PROVIDER = "serpapi" as const
const CACHE_TTL_SEC = 3600

const trendsCacheKey = (ticker: string) => `trends:${ticker.toUpperCase()}`

export type TrendDataPoint = {
  date: string
  value: number
}

type CachedTrendsWrapper = {
  raw: unknown
  fetchedAt: string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function parseTimelineValues(entry: unknown): number[] {
  if (!isRecord(entry)) return []
  const values = entry.values
  if (!Array.isArray(values)) return []
  const nums: number[] = []
  for (const v of values) {
    if (!isRecord(v)) continue
    const ev = v.extracted_value
    if (typeof ev === "number" && Number.isFinite(ev)) {
      nums.push(ev)
      continue
    }
    const raw = v.value
    if (typeof raw === "string") {
      const n = Number(raw.replace(/,/g, ""))
      if (Number.isFinite(n)) nums.push(n)
    }
  }
  return nums
}

function extractInterestSeries(raw: unknown): TrendDataPoint[] {
  if (!isRecord(raw)) return []
  const iot = raw.interest_over_time
  if (!isRecord(iot)) return []
  const timeline = iot.timeline_data
  if (!Array.isArray(timeline)) return []

  const points: TrendDataPoint[] = []
  for (const row of timeline) {
    if (!isRecord(row)) continue
    const date =
      typeof row.formattedTime === "string"
        ? row.formattedTime
        : typeof row.formattedAxisTime === "string"
          ? row.formattedAxisTime
          : typeof row.date === "string"
            ? row.date
            : "unknown"
    const vals = parseTimelineValues(row)
    if (vals.length === 0) continue
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length
    points.push({ date, value: avg })
  }
  return points
}

export function computeTrendDirection(
  data: TrendDataPoint[],
): { direction: "rising" | "stable" | "declining"; changePercent: number } | null {
  if (data.length < 3) return null
  const values = data.map((d) => d.value).filter((n) => Number.isFinite(n))
  if (values.length < 3) return null

  const headN = Math.max(1, Math.floor(values.length * 0.15))
  const tailN = Math.max(1, Math.floor(values.length * 0.15))
  const head = values.slice(0, headN)
  const tail = values.slice(-tailN)
  const firstAvg = head.reduce((a, b) => a + b, 0) / head.length
  const lastAvg = tail.reduce((a, b) => a + b, 0) / tail.length
  if (firstAvg === 0) {
    return { direction: "stable", changePercent: 0 }
  }
  const changePercent = ((lastAvg - firstAvg) / Math.abs(firstAvg)) * 100

  if (lastAvg > firstAvg * 1.05) {
    return { direction: "rising", changePercent }
  }
  if (lastAvg < firstAvg * 0.95) {
    return { direction: "declining", changePercent }
  }
  return { direction: "stable", changePercent }
}

export async function getGoogleTrends(
  redis: Redis,
  supabase: SupabaseClient,
  userId: string,
  ticker: string,
  days = 90,
): Promise<TrendDataPoint[] | null> {
  const key = trendsCacheKey(ticker)
  const cachedUnknown = await redisGetJson(redis, key)
  if (
    cachedUnknown &&
    typeof cachedUnknown === "object" &&
    cachedUnknown !== null &&
    "raw" in cachedUnknown
  ) {
    logCacheCheck(key, true)
    const cached = cachedUnknown as CachedTrendsWrapper
    return extractInterestSeries(cached.raw)
  }

  logCacheCheck(key, false)

  const apiKey = await getUserApiKey(supabase, userId, PROVIDER)
  if (!apiKey) {
    logger.info({ action: "serpapi_skip", ticker, reason: "no_api_key" })
    return null
  }

  const timeframe =
    days <= 7 ? "now 7-d" : days <= 30 ? "today 1-m" : days <= 90 ? "today 3-m" : "today 12-m"

  const url = new URL("https://serpapi.com/search.json")
  url.searchParams.set("engine", "google_trends")
  url.searchParams.set("q", ticker.toUpperCase())
  url.searchParams.set("data_type", "TIMESERIES")
  url.searchParams.set("date", timeframe)
  url.searchParams.set("api_key", apiKey)

  const started = Date.now()
  try {
    const res = await fetch(url.toString(), { method: "GET", cache: "no-store" })
    const text = await res.text()
    let raw: unknown
    try {
      raw = JSON.parse(text) as unknown
    } catch {
      await logApiCallEnd(redis, PROVIDER, ticker, started, false)
      return null
    }

    if (!res.ok) {
      await logApiCallEnd(redis, PROVIDER, ticker, started, false)
      return null
    }

    if (isRecord(raw) && typeof raw.error === "string") {
      await logApiCallEnd(redis, PROVIDER, ticker, started, false)
      logger.error({ action: "error", provider: PROVIDER, ticker, message: raw.error })
      return null
    }

    await logApiCallEnd(redis, PROVIDER, ticker, started, true)

    const wrapper: CachedTrendsWrapper = {
      raw,
      fetchedAt: new Date().toISOString(),
    }
    await redisSetJson(redis, key, wrapper, CACHE_TTL_SEC)

    return extractInterestSeries(raw)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logApiCallEnd(redis, PROVIDER, ticker, started, false)
    logger.error({ action: "error", provider: PROVIDER, ticker, message: msg })
    return null
  }
}
