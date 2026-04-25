import { NextResponse } from "next/server"

import { withLogging } from "@/lib/api-logging"
import { getCurrentUserId } from "@/lib/auth-helpers"
import { logger } from "@/lib/logger"
import { supabaseAdmin } from "@/lib/supabase-server"
import type { Dimension, Signal } from "@/lib/types"
import { validateAgainstHistoricalCase } from "@/worker/validation/historical-cases"
import { runSensitivityAnalysis } from "@/worker/validation/sensitivity"

/**
 * POST /api/validate — Demo/validation endpoint.
 *
 * Body: `{ ticker: string }`. Looks up the user's most recent persisted
 * StabilityScore for `ticker`, runs a full per-signal sensitivity sweep
 * against it, and (when applicable) compares the score against a known
 * historical benchmark from `worker/validation/historical-cases.ts`.
 *
 * This is intentionally *not* part of the worker pipeline — it's a read-only
 * inspector you can hit during the walkthrough to demonstrate that the
 * robustness rule (no single news article shifts the score by more than the
 * cap) holds for the produced score.
 */
export const POST = withLogging(async (req: Request) => {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await req.json()) as { ticker?: string }
    const ticker = body.ticker?.trim().toUpperCase()
    if (!ticker) {
      return NextResponse.json({ error: "ticker is required" }, { status: 400 })
    }

    const { data: row, error } = await supabaseAdmin
      .from("scores")
      .select(
        "id, ticker, company_name, score, segment, dimensions, signals, created_at",
      )
      .eq("user_id", userId)
      .eq("ticker", ticker)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (!row) {
      return NextResponse.json(
        {
          error: "No score found for this ticker yet. Run POST /api/score first.",
          ticker,
        },
        { status: 404 },
      )
    }

    const dimensions = (row.dimensions ?? []) as Dimension[]
    const signals = (row.signals ?? { positive: [], negative: [] }) as {
      positive: Signal[]
      negative: Signal[]
    }

    const sensitivity = runSensitivityAnalysis(dimensions, signals, row.score)
    const historicalCase = validateAgainstHistoricalCase(ticker, row.score)

    logger.info({
      action: "validate_completed",
      ticker,
      userId,
      score: row.score,
      sensitivityPassed: sensitivity.passed,
      violationCount: sensitivity.violations.length,
      historicalMatched: historicalCase.matched,
      historicalWithinRange:
        historicalCase.matched ? historicalCase.withinRange : null,
    })

    return NextResponse.json(
      {
        ticker: row.ticker,
        companyName: row.company_name,
        score: row.score,
        segment: row.segment,
        analyzedAt: row.created_at,
        sensitivity,
        historicalCase,
      },
      { status: 200 },
    )
  } catch (error) {
    logger.error({ action: "error", route: "/api/validate", error })
    return NextResponse.json(
      { error: "Failed to run validation" },
      { status: 500 },
    )
  }
})
