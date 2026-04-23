"use client"

import { useEffect, useState } from "react"
import { MOCK_RECENT_SCORES } from "@/data/mock-scores"
import type { RecentScore } from "@/lib/types"

// TODO: Replace with Supabase/API call
async function fetchRecentScores(): Promise<RecentScore[]> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(MOCK_RECENT_SCORES), 500)
  })
}

export function useRecentScores() {
  const [scores, setScores] = useState<RecentScore[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    fetchRecentScores().then((data) => {
      if (cancelled) return
      setScores(data)
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { scores, isLoading }
}
