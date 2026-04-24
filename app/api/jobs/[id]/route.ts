import { NextResponse } from "next/server"

import { getCurrentUserId } from "@/lib/auth-helpers"
import { logger } from "@/lib/logger"
import { supabaseAdmin } from "@/lib/supabase-server"

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
      .from("jobs")
      .select("id, status, progress, result_id, error, created_at, completed_at")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    return NextResponse.json(
      {
        id: data.id,
        status: data.status,
        progress: data.progress,
        resultId: data.result_id,
        error: data.error,
        createdAt: data.created_at,
        completedAt: data.completed_at,
      },
      { status: 200 },
    )
  } catch (error) {
    logger.error({ action: "error", route: "/api/jobs/[id]", error })
    return NextResponse.json({ error: "Failed to fetch job" }, { status: 500 })
  }
}
