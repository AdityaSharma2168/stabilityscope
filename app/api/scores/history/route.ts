import { NextResponse } from "next/server"

import { withLogging } from "@/lib/api-logging"
import { getCurrentUserId } from "@/lib/auth-helpers"
import { logger } from "@/lib/logger"
import { supabaseAdmin } from "@/lib/supabase-server"

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 25

export const GET = withLogging(async (req: Request) => {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const page = Number.parseInt(searchParams.get("page") ?? `${DEFAULT_PAGE}`, 10)
    const pageSize = Number.parseInt(
      searchParams.get("pageSize") ?? `${DEFAULT_PAGE_SIZE}`,
      10,
    )
    const start = (Math.max(page, 1) - 1) * Math.max(pageSize, 1)
    const end = start + Math.max(pageSize, 1) - 1

    const { data, error } = await supabaseAdmin
      .from("scores")
      .select(
        "id, ticker, company_name, score, segment, processing_time_ms, cache_hit, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(start, end)

    if (error) throw error

    const entries = (data ?? []).map((row) => ({
      id: row.id,
      ticker: row.ticker,
      companyName: row.company_name,
      score: row.score,
      segment: row.segment,
      processingTime: row.processing_time_ms ?? 0,
      cacheHit: row.cache_hit ?? false,
      analyzedAt: row.created_at,
    }))

    return NextResponse.json({ entries }, { status: 200 })
  } catch (error) {
    logger.error({ action: "error", route: "/api/scores/history", error })
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 })
  }
})
