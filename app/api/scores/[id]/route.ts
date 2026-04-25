import { NextResponse } from "next/server"

import { getCurrentUserId } from "@/lib/auth-helpers"
import { logger } from "@/lib/logger"
import { supabaseAdmin } from "@/lib/supabase-server"
import type { StabilityScore } from "@/lib/types"

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await context.params
    const { data, error } = await supabaseAdmin
      .from("scores")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: "Score not found" }, { status: 404 })
    }

    const score: StabilityScore = {
      ticker: data.ticker,
      companyName: data.company_name,
      exchange: data.exchange ?? "N/A",
      score: data.score,
      segment: data.segment,
      summary: data.summary,
      counterfactual: data.counterfactual,
      analyzedAt: data.created_at,
      processingTime: data.processing_time_ms ?? 0,
      // Persisted fetch is never the same as a live Redis hit on POST /api/score
      cacheHit: false,
      dimensions: data.dimensions,
      signals: data.signals,
      newsTimeline: data.news_timeline,
      confidence: data.confidence,
      sensitivity: data.sensitivity,
      historicalBenchmark: data.historical_benchmark,
    }

    return NextResponse.json({ score }, { status: 200 })
  } catch (error) {
    logger.error({ action: "error", route: "/api/scores/[id]", error })
    return NextResponse.json({ error: "Failed to fetch score" }, { status: 500 })
  }
}
