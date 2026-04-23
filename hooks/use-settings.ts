"use client"

import { useCallback, useEffect, useState } from "react"

export type ApiKeys = {
  alphaVantage: string
  newsApi: string
}

export type Preferences = {
  cacheTtl: string
  autoRefresh: boolean
  alertThreshold: number
}

const DEFAULT_KEYS: ApiKeys = {
  alphaVantage: "",
  newsApi: "",
}

const DEFAULT_PREFS: Preferences = {
  cacheTtl: "15",
  autoRefresh: true,
  alertThreshold: 50,
}

// TODO: Replace with Supabase/API call
async function fetchSettings(): Promise<{
  apiKeys: ApiKeys
  preferences: Preferences
}> {
  return new Promise((resolve) => {
    setTimeout(
      () => resolve({ apiKeys: DEFAULT_KEYS, preferences: DEFAULT_PREFS }),
      500,
    )
  })
}

// TODO: Replace with Supabase/API call
async function persistKeys(keys: ApiKeys): Promise<ApiKeys> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(keys), 400)
  })
}

// TODO: Replace with Supabase/API call
async function persistPreferences(prefs: Preferences): Promise<Preferences> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(prefs), 400)
  })
}

// TODO: Replace with Supabase/API call
async function runConnectionTest(provider: string): Promise<boolean> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(true), 1000)
  })
}

export function useSettings() {
  const [apiKeys, setApiKeys] = useState<ApiKeys>(DEFAULT_KEYS)
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFS)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    fetchSettings().then((data) => {
      if (cancelled) return
      setApiKeys(data.apiKeys)
      setPreferences(data.preferences)
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const saveKeys = useCallback(async (next: ApiKeys): Promise<ApiKeys> => {
    const saved = await persistKeys(next)
    setApiKeys(saved)
    return saved
  }, [])

  const savePreferences = useCallback(
    async (next: Preferences): Promise<Preferences> => {
      const saved = await persistPreferences(next)
      setPreferences(saved)
      return saved
    },
    [],
  )

  const testConnection = useCallback(
    async (provider: string): Promise<boolean> => {
      return runConnectionTest(provider)
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
