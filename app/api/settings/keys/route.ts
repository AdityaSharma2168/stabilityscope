import { NextResponse } from "next/server"

import { getCurrentUserId } from "@/lib/auth-helpers"
import { logger } from "@/lib/logger"
import { supabaseAdmin } from "@/lib/supabase-server"

const PROVIDER_MAP = {
  alphaVantage: "alpha_vantage",
  newsApi: "newsapi",
  googleTrendsKey: "serpapi",
  openai: "openai",
} as const

type ProviderInput = keyof typeof PROVIDER_MAP

export async function GET() {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabaseAdmin
      .from("user_api_keys")
      .select("provider, api_key")
      .eq("user_id", userId)

    if (error) {
      throw error
    }

    const valuesByProvider = {
      alphaVantage: "",
      newsApi: "",
      googleTrendsKey: "",
      openai: "",
    }

    for (const row of data ?? []) {
      if (row.provider === "alpha_vantage") valuesByProvider.alphaVantage = row.api_key
      if (row.provider === "newsapi") valuesByProvider.newsApi = row.api_key
      if (row.provider === "serpapi") valuesByProvider.googleTrendsKey = row.api_key
      if (row.provider === "openai") valuesByProvider.openai = row.api_key
    }

    return NextResponse.json(
      {
        keys: [
          { provider: "alphaVantage", exists: !!valuesByProvider.alphaVantage, value: valuesByProvider.alphaVantage },
          { provider: "newsApi", exists: !!valuesByProvider.newsApi, value: valuesByProvider.newsApi },
          { provider: "googleTrendsKey", exists: !!valuesByProvider.googleTrendsKey, value: valuesByProvider.googleTrendsKey },
          { provider: "openai", exists: !!valuesByProvider.openai, value: valuesByProvider.openai },
        ],
      },
      { status: 200 },
    )
  } catch (error) {
    logger.error({ action: "error", route: "/api/settings/keys", error })
    return NextResponse.json(
      { error: "Failed to fetch API key status" },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await req.json()) as {
      provider?: ProviderInput
      apiKey?: string
    }

    if (!body.provider || !body.apiKey) {
      return NextResponse.json(
        { error: "provider and apiKey are required" },
        { status: 400 },
      )
    }

    const mappedProvider = PROVIDER_MAP[body.provider]
    if (!mappedProvider) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from("user_api_keys").upsert(
      {
        user_id: userId,
        provider: mappedProvider,
        api_key: body.apiKey,
      },
      { onConflict: "user_id,provider" },
    )

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    logger.error({ action: "error", route: "/api/settings/keys", error })
    return NextResponse.json({ error: "Failed to save API key" }, { status: 500 })
  }
}
