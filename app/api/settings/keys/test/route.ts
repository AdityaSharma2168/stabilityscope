import { NextResponse } from "next/server"

import { withLogging } from "@/lib/api-logging"
import { getCurrentUserId } from "@/lib/auth-helpers"
import { logger } from "@/lib/logger"
import { supabaseAdmin } from "@/lib/supabase-server"

const PROVIDER_MAP = {
  Tiingo: "tiingo",
  NewsAPI: "newsapi",
  "Google Trends": "serpapi",
} as const

type ProviderInput = keyof typeof PROVIDER_MAP

function validateApiKeyFormat(provider: ProviderInput, apiKey: string): string | null {
  if (provider === "Tiingo") {
    return /^[a-f0-9]{40}$/i.test(apiKey)
      ? null
      : "Tiingo key must be a 40-character hex token"
  }

  if (provider === "NewsAPI") {
    return /^[a-f0-9]{32}$/i.test(apiKey)
      ? null
      : "NewsAPI key must be a 32-character token"
  }

  return /^[a-f0-9]{64}$/i.test(apiKey)
    ? null
    : "SerpAPI key must be a 64-character token"
}

async function testProvider(provider: ProviderInput, apiKey: string): Promise<void> {
  if (provider === "Tiingo") {
    const response = await fetch("https://api.tiingo.com/api/test", {
      method: "GET",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })
    const text = await response.text()
    if (!response.ok) {
      let detail = `HTTP ${response.status}`
      try {
        const parsed = JSON.parse(text) as { detail?: string; message?: string }
        detail = parsed.detail || parsed.message || detail
      } catch {
        // body wasn't JSON; keep default detail
      }
      throw new Error(detail || "Tiingo request failed")
    }
    return
  }

  if (provider === "NewsAPI") {
    const url = new URL("https://newsapi.org/v2/top-headlines")
    url.searchParams.set("country", "us")
    url.searchParams.set("pageSize", "1")
    const response = await fetch(url, {
      method: "GET",
      headers: { "X-Api-Key": apiKey },
      cache: "no-store",
    })
    const payload = (await response.json()) as { status?: string; message?: string }
    if (!response.ok || payload.status !== "ok") {
      throw new Error(payload.message || "NewsAPI request failed")
    }
    return
  }

  const url = new URL("https://serpapi.com/search.json")
  url.searchParams.set("engine", "google_trends")
  url.searchParams.set("q", "test")
  url.searchParams.set("api_key", apiKey)
  const response = await fetch(url, { method: "GET", cache: "no-store" })
  const payload = (await response.json()) as { error?: string }
  if (!response.ok || payload.error) {
    throw new Error(payload.error || "SerpAPI request failed")
  }
}

export const POST = withLogging(async (req: Request) => {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      )
    }

    const body = (await req.json()) as { provider?: ProviderInput; apiKey?: string }
    if (!body.provider || !(body.provider in PROVIDER_MAP)) {
      return NextResponse.json(
        { success: false, error: "Invalid provider" },
        { status: 400 },
      )
    }

    let keyToTest = body.apiKey?.trim() || ""

    if (!keyToTest) {
      const dbProvider = PROVIDER_MAP[body.provider]

      const { data, error } = await supabaseAdmin
        .from("user_api_keys")
        .select("api_key")
        .eq("user_id", userId)
        .eq("provider", dbProvider)
        .maybeSingle()

      if (error) throw error
      if (!data?.api_key) {
        return NextResponse.json(
          { success: false, error: "API key not configured" },
          { status: 400 },
        )
      }
      keyToTest = data.api_key
    }

    const formatError = validateApiKeyFormat(body.provider, keyToTest)
    if (formatError) {
      return NextResponse.json(
        { success: false, error: formatError },
        { status: 400 },
      )
    }

    try {
      await testProvider(body.provider, keyToTest)
      return NextResponse.json({ success: true }, { status: 200 })
    } catch (providerError) {
      const message =
        providerError instanceof Error
          ? providerError.message
          : "Provider test request failed"
      return NextResponse.json(
        { success: false, error: message },
        { status: 400 },
      )
    }
  } catch (error) {
    logger.error({ action: "error", route: "/api/settings/keys/test", error })
    return NextResponse.json(
      { success: false, error: "Failed to test API key" },
      { status: 500 },
    )
  }
})
