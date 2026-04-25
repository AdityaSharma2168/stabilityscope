import { NextResponse } from "next/server"

import { getCurrentUserId } from "@/lib/auth-helpers"
import { DOW30_NOT_SUPPORTED_MESSAGE, isDow30Ticker } from "@/lib/dow30"
import { logger } from "@/lib/logger"
import { scoringQueue } from "@/lib/queue"
import { redis } from "@/lib/redis"
import {
  SCORE_PIPELINE_VERSION,
  stabilityScoreCacheKey,
} from "@/lib/score-cache-key"
import { supabaseAdmin } from "@/lib/supabase-server"
import type { StabilityScore } from "@/lib/types"

export async function POST(req: Request) {
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
    if (!force) {
      const cached = await redis.get(cacheKey)
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as StabilityScore
          const versionOk =
            (parsed.pipelineVersion ?? 0) >= SCORE_PIPELINE_VERSION
          if (versionOk) {
            logger.info({ action: "cache_check", key: cacheKey, hit: true })
            const score: StabilityScore = { ...parsed, cacheHit: true }
            return NextResponse.json({ score, cacheHit: true }, { status: 200 })
          }
          logger.info({
            action: "cache_check",
            key: cacheKey,
            hit: false,
            reason: "stale_cached_score",
            hadVersion: parsed.pipelineVersion ?? 0,
          })
        } catch {
          logger.warn({ action: "cache_check", key: cacheKey, reason: "invalid_json" })
        }
        await redis.del(cacheKey)
      }
    }

    logger.info({ action: "cache_check", key: cacheKey, hit: false })

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
    logger.error({ action: "error", route: "/api/score", error })
    return NextResponse.json(
      { error: "Failed to enqueue score job" },
      { status: 500 },
    )
  }
}
