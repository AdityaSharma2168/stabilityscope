import { NextResponse } from "next/server"

import { getCurrentUserId } from "@/lib/auth-helpers"
import { logger } from "@/lib/logger"
import { supabaseAdmin } from "@/lib/supabase-server"

async function resolveCompanyName(
  ticker: string,
  apiKey: string | null,
): Promise<string> {
  if (!apiKey) return `${ticker} Inc.`

  try {
    const url = new URL("https://api.tiingo.com/tiingo/utilities/search")
    url.searchParams.set("query", ticker)

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })
    if (!response.ok) return `${ticker} Inc.`

    const data = (await response.json()) as Array<{
      ticker?: string
      name?: string
    }>
    const upper = ticker.toUpperCase()
    const exact = Array.isArray(data)
      ? data.find((row) => row.ticker?.toUpperCase() === upper)
      : null
    const fallback = Array.isArray(data) ? data[0] : null
    return exact?.name || fallback?.name || `${ticker} Inc.`
  } catch {
    return `${ticker} Inc.`
  }
}

export async function GET() {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: watchlistRows, error: watchlistError } = await supabaseAdmin
      .from("watchlist")
      .select("ticker, company_name, added_at")
      .eq("user_id", userId)
      .order("added_at", { ascending: false })

    if (watchlistError) throw watchlistError

    const tickers = (watchlistRows ?? []).map((row) => row.ticker)
    const latestScoreMap = new Map<
      string,
      { score: number; segment: string; created_at: string }
    >()

    if (tickers.length > 0) {
      const { data: scoreRows, error: scoreError } = await supabaseAdmin
        .from("scores")
        .select("ticker, score, segment, created_at")
        .eq("user_id", userId)
        .in("ticker", tickers)
        .order("created_at", { ascending: false })

      if (scoreError) throw scoreError

      for (const row of scoreRows ?? []) {
        if (!latestScoreMap.has(row.ticker)) {
          latestScoreMap.set(row.ticker, {
            score: row.score,
            segment: row.segment,
            created_at: row.created_at,
          })
        }
      }
    }

    const items = (watchlistRows ?? []).map((row) => {
      const latest = latestScoreMap.get(row.ticker)
      return {
        ticker: row.ticker,
        companyName: row.company_name,
        score: latest?.score ?? 0,
        segment: latest?.segment ?? "Distressed",
        change: 0,
        lastUpdated: latest?.created_at ?? row.added_at,
      }
    })

    return NextResponse.json({ items }, { status: 200 })
  } catch (error) {
    logger.error({ action: "error", route: "/api/watchlist", error })
    return NextResponse.json({ error: "Failed to fetch watchlist" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await req.json()) as { ticker?: string; companyName?: string }
    const ticker = body.ticker?.trim().toUpperCase()
    if (!ticker) {
      return NextResponse.json({ error: "Ticker is required" }, { status: 400 })
    }

    const { data: keyRow } = await supabaseAdmin
      .from("user_api_keys")
      .select("api_key")
      .eq("user_id", userId)
      .eq("provider", "tiingo")
      .maybeSingle()

    const companyName =
      body.companyName?.trim() ||
      (await resolveCompanyName(ticker, keyRow?.api_key ?? null))

    const { error } = await supabaseAdmin.from("watchlist").insert({
      user_id: userId,
      ticker,
      company_name: companyName,
    })

    if (error) throw error

    return NextResponse.json(
      {
        item: {
          ticker,
          companyName,
          score: 0,
          segment: "Distressed",
          change: 0,
          lastUpdated: new Date().toISOString(),
        },
      },
      { status: 201 },
    )
  } catch (error) {
    logger.error({ action: "error", route: "/api/watchlist", error })
    return NextResponse.json({ error: "Failed to add ticker" }, { status: 500 })
  }
}
