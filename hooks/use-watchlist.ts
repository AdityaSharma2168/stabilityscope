"use client"

import { useCallback, useEffect, useState } from "react"
import { authedFetch } from "@/lib/authed-fetch"
import type { WatchlistItem } from "@/lib/types"

async function fetchWatchlist(): Promise<WatchlistItem[]> {
  const response = await authedFetch("/api/watchlist", { method: "GET" })
  if (!response.ok) throw new Error("Failed to fetch watchlist")
  const json = (await response.json()) as { items: WatchlistItem[] }
  return json.items
}

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    fetchWatchlist()
      .then((data) => {
        if (cancelled) return
        setItems(data)
        setIsLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setItems([])
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const addTicker = useCallback(
    async (ticker: string): Promise<WatchlistItem> => {
      const t = ticker.trim().toUpperCase()
      const response = await authedFetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: t }),
      })
      if (!response.ok) {
        throw new Error("Failed to add ticker")
      }

      const json = (await response.json()) as { item: WatchlistItem }
      const saved = json.item
      setItems((prev) => [saved, ...prev])
      return saved
    },
    [],
  )

  const removeTicker = useCallback(async (ticker: string): Promise<void> => {
    const response = await authedFetch(`/api/watchlist/${ticker.toUpperCase()}`, {
      method: "DELETE",
    })
    if (!response.ok) {
      throw new Error("Failed to remove ticker")
    }
    setItems((prev) => prev.filter((i) => i.ticker !== ticker))
  }, [])

  return { items, isLoading, addTicker, removeTicker }
}
