"use client"

import { useCallback, useEffect, useState } from "react"
import { MOCK_WATCHLIST } from "@/data/mock-watchlist"
import type { WatchlistItem } from "@/lib/types"

// TODO: Replace with Supabase/API call
async function fetchWatchlist(): Promise<WatchlistItem[]> {
  return new Promise((resolve) => {
    setTimeout(() => resolve([...MOCK_WATCHLIST]), 500)
  })
}

// TODO: Replace with Supabase/API call
async function persistAdd(item: WatchlistItem): Promise<WatchlistItem> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(item), 300)
  })
}

// TODO: Replace with Supabase/API call
async function persistRemove(ticker: string): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), 300)
  })
}

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    fetchWatchlist().then((data) => {
      if (cancelled) return
      setItems(data)
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const addTicker = useCallback(
    async (ticker: string): Promise<WatchlistItem> => {
      const t = ticker.trim().toUpperCase()
      const newItem: WatchlistItem = {
        ticker: t,
        companyName: `${t} Inc.`,
        score: 50 + Math.floor(Math.random() * 40),
        segment: "Fundamentally Strong, Reputationally Clean",
        change: Math.floor(Math.random() * 12) - 6,
        lastUpdated: new Date().toISOString(),
      }
      const saved = await persistAdd(newItem)
      setItems((prev) => [saved, ...prev])
      return saved
    },
    [],
  )

  const removeTicker = useCallback(async (ticker: string): Promise<void> => {
    await persistRemove(ticker)
    setItems((prev) => prev.filter((i) => i.ticker !== ticker))
  }, [])

  return { items, isLoading, addTicker, removeTicker }
}
