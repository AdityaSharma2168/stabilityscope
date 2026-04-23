export type DimensionCategory = "financial" | "sentiment"

export type DimensionTrend =
  | "stable"
  | "strong"
  | "slightly_high"
  | "positive"
  | "watchlist"
  | "volatile"
  | "declining"
  | "critical"

export type Dimension = {
  name: string
  category: DimensionCategory
  score: number
  weight: number
  description: string
  rawValue: string
  trend: DimensionTrend
}

export type Signal = {
  text: string
  source: string
  date: string
  impact: number
}

export type NewsPoint = {
  date: string
  sentiment: number
  count: number
  headline: string
}

export type Counterfactual = {
  condition: string
  currentScore: number
  projectedScore: number
  currentSegment: string
  projectedSegment: string
}

export type StabilityScore = {
  ticker: string
  companyName: string
  exchange: string
  score: number
  segment: string
  summary: string
  counterfactual: Counterfactual
  analyzedAt: string
  processingTime: number
  cacheHit?: boolean
  dimensions: Dimension[]
  signals: {
    positive: Signal[]
    negative: Signal[]
  }
  newsTimeline: NewsPoint[]
}

export type RecentScore = {
  ticker: string
  companyName: string
  score: number
  segment: string
  timestamp: string
  change: number
}

export type WatchlistItem = {
  ticker: string
  companyName: string
  score: number
  segment: string
  change: number
  lastUpdated: string
}

export type HistoryEntry = {
  id: string
  ticker: string
  companyName: string
  score: number
  segment: string
  processingTime: number
  cacheHit: boolean
  analyzedAt: string
}

export type ScoreTier = "high" | "medium" | "low"
