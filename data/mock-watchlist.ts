import type { WatchlistItem } from "@/lib/types"

export const MOCK_WATCHLIST: WatchlistItem[] = [
  {
    ticker: "AAPL",
    companyName: "Apple Inc.",
    score: 82,
    segment: "Fundamentally Strong, Reputationally Clean",
    change: 3,
    lastUpdated: "2024-07-23T10:00:00Z",
  },
  {
    ticker: "TSLA",
    companyName: "Tesla Inc.",
    score: 45,
    segment: "Financially Strong, Reputation Declining",
    change: -8,
    lastUpdated: "2024-07-23T09:30:00Z",
  },
  {
    ticker: "NVDA",
    companyName: "NVIDIA Corp.",
    score: 89,
    segment: "Fundamentally Strong, Reputationally Clean",
    change: 5,
    lastUpdated: "2024-07-21T16:00:00Z",
  },
]
