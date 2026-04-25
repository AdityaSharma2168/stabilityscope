import { NextResponse } from "next/server"

import { withLogging } from "@/lib/api-logging"
import { logger } from "@/lib/logger"
import { redis } from "@/lib/redis"
import { supabaseAdmin } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"

const PROCESS_STARTED_AT = Date.now()

async function pingSupabase(): Promise<{ ok: boolean; error?: string }> {
  try {
    // `count` head request is the cheapest no-op: returns metadata only.
    const { error } = await supabaseAdmin
      .from("user_preferences")
      .select("user_id", { head: true, count: "exact" })
      .limit(1)
    if (error) {
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function pingRedis(): Promise<{ ok: boolean; error?: string }> {
  try {
    const reply = await redis.ping()
    return { ok: reply === "PONG" }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export const GET = withLogging(async () => {
  const [supabaseStatus, redisStatus] = await Promise.all([
    pingSupabase(),
    pingRedis(),
  ])

  const healthy = supabaseStatus.ok && redisStatus.ok
  const uptimeSeconds = Math.floor((Date.now() - PROCESS_STARTED_AT) / 1000)

  if (!healthy) {
    logger.warn({
      action: "health_check_unhealthy",
      supabase: supabaseStatus.ok,
      redis: redisStatus.ok,
      supabaseError: supabaseStatus.error,
      redisError: redisStatus.error,
    })
  }

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      supabase: supabaseStatus.ok,
      redis: redisStatus.ok,
      uptime: uptimeSeconds,
      ...(supabaseStatus.error || redisStatus.error
        ? {
            errors: {
              ...(supabaseStatus.error ? { supabase: supabaseStatus.error } : {}),
              ...(redisStatus.error ? { redis: redisStatus.error } : {}),
            },
          }
        : {}),
    },
    { status: healthy ? 200 : 503 },
  )
})
