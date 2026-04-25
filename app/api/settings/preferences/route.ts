import { NextResponse } from "next/server"

import { withLogging } from "@/lib/api-logging"
import { getCurrentUserId } from "@/lib/auth-helpers"
import { logger } from "@/lib/logger"
import { supabaseAdmin } from "@/lib/supabase-server"

export const GET = withLogging(async () => {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabaseAdmin
      .from("user_preferences")
      .select("cache_ttl_minutes, auto_refresh_watchlist, score_alert_threshold")
      .eq("user_id", userId)
      .maybeSingle()

    if (error) throw error

    return NextResponse.json(
      {
        preferences: {
          cacheTtl: String(data?.cache_ttl_minutes ?? 15),
          autoRefresh: data?.auto_refresh_watchlist ?? true,
          alertThreshold: data?.score_alert_threshold ?? 50,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    logger.error({ action: "error", route: "/api/settings/preferences", error })
    return NextResponse.json(
      { error: "Failed to fetch preferences" },
      { status: 500 },
    )
  }
})

export const POST = withLogging(async (req: Request) => {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await req.json()) as {
      cacheTtl?: string
      autoRefresh?: boolean
      alertThreshold?: number
    }

    const cacheTtlMinutes = Number.parseInt(body.cacheTtl ?? "15", 10)
    const autoRefresh = body.autoRefresh ?? true
    const alertThreshold = body.alertThreshold ?? 50

    const { error } = await supabaseAdmin.from("user_preferences").upsert(
      {
        user_id: userId,
        cache_ttl_minutes: cacheTtlMinutes,
        auto_refresh_watchlist: autoRefresh,
        score_alert_threshold: alertThreshold,
      },
      { onConflict: "user_id" },
    )

    if (error) throw error

    return NextResponse.json(
      {
        preferences: {
          cacheTtl: String(cacheTtlMinutes),
          autoRefresh,
          alertThreshold,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    logger.error({ action: "error", route: "/api/settings/preferences", error })
    return NextResponse.json(
      { error: "Failed to save preferences" },
      { status: 500 },
    )
  }
})
