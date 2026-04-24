"use client"

import { useEffect, useState } from "react"
import { authedFetch } from "@/lib/authed-fetch"
import type { HistoryEntry } from "@/lib/types"

async function fetchHistory(): Promise<HistoryEntry[]> {
  const response = await authedFetch("/api/scores/history?page=1&pageSize=250", {
    method: "GET",
  })
  if (!response.ok) throw new Error("Failed to fetch history")
  const json = (await response.json()) as { entries: HistoryEntry[] }
  return json.entries
}

export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    fetchHistory()
      .then((data) => {
        if (cancelled) return
        setEntries(data)
        setIsLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setEntries([])
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { entries, isLoading }
}
