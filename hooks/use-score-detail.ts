"use client"

import { useCallback, useEffect, useState } from "react"
import { getScoreForTicker } from "@/data/mock-scores"
import type { StabilityScore } from "@/lib/types"

// TODO: Replace with Supabase/API call
async function fetchScoreForTicker(ticker: string): Promise<StabilityScore> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(getScoreForTicker(ticker)), 500)
  })
}

export function useScoreDetail(ticker: string) {
  const [score, setScore] = useState<StabilityScore | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!ticker) return
    let cancelled = false
    setIsLoading(true)
    fetchScoreForTicker(ticker).then((data) => {
      if (cancelled) return
      setScore(data)
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [ticker, reloadKey])

  const refresh = useCallback(() => {
    setReloadKey((k) => k + 1)
  }, [])

  return { score, isLoading, refresh }
}
