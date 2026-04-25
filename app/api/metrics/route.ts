import { NextResponse } from "next/server"

import { withLogging } from "@/lib/api-logging"
import { logger } from "@/lib/logger"
import { scoringQueue } from "@/lib/queue"
import { redis } from "@/lib/redis"

export const dynamic = "force-dynamic"

const PROCESS_STARTED_AT = Date.now()

const PROVIDERS = ["tiingo", "newsapi", "serpapi", "openai"] as const
type Provider = (typeof PROVIDERS)[number]

function toInt(value: string | null): number {
  if (!value) return 0
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : 0
}

function divideOr(numerator: number, denominator: number, fallback: number): number {
  if (!denominator) return fallback
  return numerator / denominator
}

async function readQueueDepth(): Promise<number> {
  try {
    const counts = await scoringQueue.getJobCounts(
      "waiting",
      "active",
      "delayed",
    )
    return (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0)
  } catch (err) {
    logger.warn({
      action: "metrics_queue_depth_failed",
      error: err instanceof Error ? err.message : String(err),
    })
    return 0
  }
}

export const GET = withLogging(async () => {
  const providerKeys: string[] = []
  for (const p of PROVIDERS) {
    providerKeys.push(
      `metrics:api_calls:${p}`,
      `metrics:api_errors:${p}`,
      `metrics:api_duration_sum_ms:${p}`,
      `metrics:api_duration_count:${p}`,
    )
  }

  const baseKeys = [
    "metrics:cache_hits",
    "metrics:cache_misses",
    "metrics:jobs_completed",
    "metrics:jobs_failed",
    "metrics:job_duration_sum_ms",
    "metrics:job_duration_count",
  ]

  const [values, queueDepth] = await Promise.all([
    redis.mget(...baseKeys, ...providerKeys),
    readQueueDepth(),
  ])

  const baseValues = values.slice(0, baseKeys.length)
  const providerValues = values.slice(baseKeys.length)

  const cacheHits = toInt(baseValues[0])
  const cacheMisses = toInt(baseValues[1])
  const jobsCompleted = toInt(baseValues[2])
  const jobsFailed = toInt(baseValues[3])
  const jobDurationSum = toInt(baseValues[4])
  const jobDurationCount = toInt(baseValues[5])

  const cacheTotal = cacheHits + cacheMisses
  const cacheHitRate = Number(
    divideOr(cacheHits, cacheTotal, 0).toFixed(4),
  )
  const avgProcessingMs = Math.round(
    divideOr(jobDurationSum, jobDurationCount, 0),
  )

  const externalApis: Record<Provider, { calls: number; avg_ms: number; errors: number }> =
    {} as Record<Provider, { calls: number; avg_ms: number; errors: number }>

  PROVIDERS.forEach((provider, idx) => {
    const offset = idx * 4
    const calls = toInt(providerValues[offset])
    const errors = toInt(providerValues[offset + 1])
    const durationSum = toInt(providerValues[offset + 2])
    const durationCount = toInt(providerValues[offset + 3])
    externalApis[provider] = {
      calls,
      avg_ms: Math.round(divideOr(durationSum, durationCount, 0)),
      errors,
    }
  })

  const uptimeSeconds = Math.floor((Date.now() - PROCESS_STARTED_AT) / 1000)

  return NextResponse.json(
    {
      uptime_seconds: uptimeSeconds,
      cache: {
        hits: cacheHits,
        misses: cacheMisses,
        hit_rate: cacheHitRate,
      },
      jobs: {
        completed: jobsCompleted,
        failed: jobsFailed,
        avg_processing_ms: avgProcessingMs,
        queue_depth: queueDepth,
      },
      external_apis: externalApis,
    },
    { status: 200 },
  )
})
