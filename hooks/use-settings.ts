"use client"

import { useCallback, useEffect, useState } from "react"
import { authedFetch } from "@/lib/authed-fetch"

export type ApiKeys = {
  alphaVantage: string
  newsApi: string
  googleTrendsKey: string
}

export type Preferences = {
  cacheTtl: string
  autoRefresh: boolean
  alertThreshold: number
}

export type ConnectionTestResult = {
  success: boolean
  error?: string
}

type TestProvider = "Alpha Vantage" | "NewsAPI" | "Google Trends"

const DEFAULT_KEYS: ApiKeys = {
  alphaVantage: "",
  newsApi: "",
  googleTrendsKey: "",
}

const DEFAULT_PREFS: Preferences = {
  cacheTtl: "15",
  autoRefresh: true,
  alertThreshold: 50,
}

export function useSettings() {
  const [apiKeys, setApiKeys] = useState<ApiKeys>(DEFAULT_KEYS)
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFS)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setIsLoading(true)

        const [keysRes, prefsRes] = await Promise.all([
          authedFetch("/api/settings/keys", { method: "GET" }),
          authedFetch("/api/settings/preferences", { method: "GET" }),
        ])
        if (!keysRes.ok || !prefsRes.ok) {
          if (!cancelled) setIsLoading(false)
          return
        }

        const keysJson = (await keysRes.json()) as {
          keys: Array<{ provider: string; exists: boolean; value?: string }>
        }
        const prefsJson = (await prefsRes.json()) as { preferences: Preferences }
        if (cancelled) return

        const valueFor = (provider: string) =>
          keysJson.keys.find((entry) => entry.provider === provider)?.value || ""

        setApiKeys({
          alphaVantage: valueFor("alphaVantage"),
          newsApi: valueFor("newsApi"),
          googleTrendsKey: valueFor("googleTrendsKey"),
        })
        setPreferences(prefsJson.preferences ?? DEFAULT_PREFS)
        setIsLoading(false)
      } catch {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const saveKeys = useCallback(async (next: ApiKeys): Promise<ApiKeys> => {
    const providers: Array<{ provider: keyof ApiKeys; dbProvider: string }> = [
      { provider: "alphaVantage", dbProvider: "alphaVantage" },
      { provider: "newsApi", dbProvider: "newsApi" },
      { provider: "googleTrendsKey", dbProvider: "googleTrendsKey" },
    ]

    for (const item of providers) {
      const value = next[item.provider].trim()
      if (!value) continue

      const response = await authedFetch("/api/settings/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: item.dbProvider,
          apiKey: value,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to save API key")
      }
    }

    setApiKeys(next)
    return next
  }, [])

  const savePreferences = useCallback(
    async (next: Preferences): Promise<Preferences> => {
      const response = await authedFetch("/api/settings/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      })
      if (!response.ok) {
        throw new Error("Failed to save preferences")
      }
      const json = (await response.json()) as { preferences: Preferences }
      const saved = json.preferences
      setPreferences(saved)
      return saved
    },
    [],
  )

  const testConnection = useCallback(
    async (provider: TestProvider, apiKey?: string): Promise<ConnectionTestResult> => {
      const response = await authedFetch("/api/settings/keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey }),
      })
      const json = (await response.json()) as ConnectionTestResult
      if (!response.ok) {
        return { success: false, error: json.error || "Connection test failed" }
      }
      return json
    },
    [],
  )

  return {
    apiKeys,
    preferences,
    isLoading,
    saveKeys,
    savePreferences,
    testConnection,
  }
}
