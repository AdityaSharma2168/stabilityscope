"use client"

import { useEffect, useState } from "react"
import { MOCK_HISTORY } from "@/data/mock-history"
import type { HistoryEntry } from "@/lib/types"

// TODO: Replace with Supabase/API call
async function fetchHistory(): Promise<HistoryEntry[]> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(MOCK_HISTORY), 500)
  })
}

export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    fetchHistory().then((data) => {
      if (cancelled) return
      setEntries(data)
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { entries, isLoading }
}
