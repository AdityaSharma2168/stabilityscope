import { NextResponse } from "next/server"

import { getCurrentUserId } from "@/lib/auth-helpers"
import { logger } from "@/lib/logger"
import { scoringQueue } from "@/lib/queue"
import { redis } from "@/lib/redis"
import { supabaseAdmin } from "@/lib/supabase-server"

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const force = url.searchParams.get("force") === "true"
    const body = (await req.json()) as { ticker?: string }
    const ticker = body.ticker?.trim().toUpperCase()
    if (!ticker) {
      return NextResponse.json({ error: "ticker is required" }, { status: 400 })
    }

    const cacheKey = `score:${userId}:${ticker}`
    if (!force) {
      const cached = await redis.get(cacheKey)
      if (cached) {
        logger.info({ action: "cache_check", key: cacheKey, hit: true })
        return NextResponse.json(
          { score: JSON.parse(cached), cacheHit: true },
          { status: 200 },
        )
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
