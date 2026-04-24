import { NextResponse } from "next/server"

import { getCurrentUserId } from "@/lib/auth-helpers"
import { logger } from "@/lib/logger"
import { supabaseAdmin } from "@/lib/supabase-server"

export async function GET() {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabaseAdmin
      .from("scores")
      .select("ticker, company_name, score, segment, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(24)

    if (error) throw error

    const previousScoreByTicker = new Map<string, number>()
    const recent = []

    for (const row of data ?? []) {
      if (recent.length < 6) {
        const previous = previousScoreByTicker.get(row.ticker)
        recent.push({
          ticker: row.ticker,
          companyName: row.company_name,
          score: row.score,
          segment: row.segment,
          timestamp: row.created_at,
          change: previous !== undefined ? row.score - previous : 0,
        })
      }

      if (!previousScoreByTicker.has(row.ticker)) {
        previousScoreByTicker.set(row.ticker, row.score)
      }
    }

    return NextResponse.json({ scores: recent }, { status: 200 })
  } catch (error) {
    logger.error({ action: "error", route: "/api/scores/recent", error })
    return NextResponse.json(
      { error: "Failed to fetch recent scores" },
      { status: 500 },
    )
  }
}
