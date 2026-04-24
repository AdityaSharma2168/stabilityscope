"use client"

import { useEffect, useState } from "react"
import { authedFetch } from "@/lib/authed-fetch"
import type { RecentScore } from "@/lib/types"

async function fetchRecentScores(): Promise<RecentScore[]> {
  const response = await authedFetch("/api/scores/recent", { method: "GET" })
  if (!response.ok) throw new Error("Failed to fetch recent scores")
  const json = (await response.json()) as { scores: RecentScore[] }
  return json.scores
}

export function useRecentScores() {
  const [scores, setScores] = useState<RecentScore[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    fetchRecentScores()
      .then((data) => {
        if (cancelled) return
        setScores(data)
        setIsLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setScores([])
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { scores, isLoading }
}
