import { NextResponse } from "next/server"

import { getCurrentUserId } from "@/lib/auth-helpers"
import { logger } from "@/lib/logger"
import { supabaseAdmin } from "@/lib/supabase-server"

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ ticker: string }> },
) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const params = await context.params
    const ticker = params.ticker.toUpperCase()

    const { error } = await supabaseAdmin
      .from("watchlist")
      .delete()
      .eq("user_id", userId)
      .eq("ticker", ticker)

    if (error) throw error

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    logger.error({ action: "error", route: "/api/watchlist/[ticker]", error })
    return NextResponse.json(
      { error: "Failed to remove ticker" },
      { status: 500 },
    )
  }
}
