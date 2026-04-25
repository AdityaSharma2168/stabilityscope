import { NextResponse } from "next/server"

import { withLogging } from "@/lib/api-logging"
import { getCurrentUserId } from "@/lib/auth-helpers"
import { deleteCache, getCached } from "@/lib/cache"
import { DOW30_NOT_SUPPORTED_MESSAGE, isDow30Ticker } from "@/lib/dow30"
import { logger } from "@/lib/logger"
import { scoringQueue } from "@/lib/queue"
import {
  SCORE_PIPELINE_VERSION,
  stabilityScoreCacheKey,
} from "@/lib/score-cache-key"
import { supabaseAdmin } from "@/lib/supabase-server"
import type { StabilityScore } from "@/lib/types"

const DEFAULT_CACHE_TTL_MIN = 15

async function loadUserCacheTtlSeconds(userId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("user_preferences")
    .select("cache_ttl_minutes")
    .eq("user_id", userId)
    .maybeSingle()

  const minutes =
    typeof data?.cache_ttl_minutes === "number" && data.cache_ttl_minutes > 0
      ? data.cache_ttl_minutes
      : DEFAULT_CACHE_TTL_MIN
  return Math.max(60, Math.floor(minutes * 60))
}

export const POST = withLogging(async (req: Request) => {
  const start = Date.now()
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const body = (await req.json()) as { ticker?: string; force?: boolean }
    const force =
      body.force === true || url.searchParams.get("force") === "true"
    const ticker = body.ticker?.trim().toUpperCase()
    if (!ticker) {
      return NextResponse.json({ error: "ticker is required" }, { status: 400 })
    }

    logger.info({
      action: "score_request",
      method: "POST",
      path: "/api/score",
      userId,
      ticker,
      force,
    })

    if (!isDow30Ticker(ticker)) {
      logger.warn({
        action: "score_request_rejected",
        reason: "non_dow30_ticker",
        ticker,
        userId,
      })
      return NextResponse.json(
        { error: DOW30_NOT_SUPPORTED_MESSAGE },
        { status: 400 },
      )
    }

    const cacheKey = stabilityScoreCacheKey(userId, ticker)
    const ttlSeconds = await loadUserCacheTtlSeconds(userId)

    if (force) {
      logger.info({
        action: "cache_bypass",
        key: cacheKey,
        ticker,
        userId,
        reason: "force_refresh",
      })
    } else {
      const parsed = await getCached<StabilityScore>(cacheKey)
      if (parsed) {
        const versionOk =
          (parsed.pipelineVersion ?? 0) >= SCORE_PIPELINE_VERSION
        if (versionOk) {
          logger.info({
            action: "score_cache_hit",
            ticker,
            userId,
            ttlSeconds,
          })
          const score: StabilityScore = { ...parsed, cacheHit: true }
          return NextResponse.json({ score, cacheHit: true }, { status: 200 })
        }
        logger.info({
          action: "cache_invalidate_stale",
          key: cacheKey,
          hadVersion: parsed.pipelineVersion ?? 0,
          requiredVersion: SCORE_PIPELINE_VERSION,
        })
        await deleteCache(cacheKey)
      }
    }

    logger.info({
      action: "score_cache_miss",
      ticker,
      userId,
      forced: force,
      ttlSeconds,
    })

    const { data: jobRow, error: insertError } = await supabaseAdmin
      .from("jobs")
      .insert({
        user_id: userId,
        ticker,
        status: "queued",
        progress: { step: 0, message: "Queued" },
      })
      .select("id")
      .single()

    if (insertError) throw insertError

    await scoringQueue.add(
      "score-ticker",
      { jobId: jobRow.id, userId, ticker },
      { jobId: jobRow.id, removeOnComplete: 200, removeOnFail: 200 },
    )

    return NextResponse.json({ jobId: jobRow.id, cacheHit: false }, { status: 202 })
  } catch (error) {
    logger.error({
      action: "error",
      route: "/api/score",
      durationMs: Date.now() - start,
      error,
    })
    return NextResponse.json(
      { error: "Failed to enqueue score job" },
      { status: 500 },
    )
  }
})
