import type { RecentScore, StabilityScore } from "@/lib/types"

export const MOCK_RECENT_SCORES: RecentScore[] = [
  {
    ticker: "AAPL",
    companyName: "Apple Inc.",
    score: 82,
    segment: "Fundamentally Strong, Reputationally Clean",
    timestamp: "2024-07-23T10:00:00Z",
    change: 3,
  },
  {
    ticker: "TSLA",
    companyName: "Tesla Inc.",
    score: 45,
    segment: "Financially Strong, Reputation Declining",
    timestamp: "2024-07-23T09:30:00Z",
    change: -8,
  },
  {
    ticker: "META",
    companyName: "Meta Platforms",
    score: 71,
    segment: "Fundamentally Strong, Reputationally Clean",
    timestamp: "2024-07-22T14:00:00Z",
    change: 1,
  },
  {
    ticker: "COIN",
    companyName: "Coinbase Global",
    score: 38,
    segment: "Financially Weak, Sentiment Propped",
    timestamp: "2024-07-22T11:00:00Z",
    change: -12,
  },
  {
    ticker: "NVDA",
    companyName: "NVIDIA Corp.",
    score: 89,
    segment: "Fundamentally Strong, Reputationally Clean",
    timestamp: "2024-07-21T16:00:00Z",
    change: 5,
  },
  {
    ticker: "JPM",
    companyName: "JPMorgan Chase",
    score: 76,
    segment: "Fundamentally Strong, Reputationally Clean",
    timestamp: "2024-07-21T10:00:00Z",
    change: 0,
  },
]

const AAPL: StabilityScore = {
  ticker: "AAPL",
  companyName: "Apple Inc.",
  exchange: "NASDAQ",
  score: 82,
  segment: "Fundamentally Strong, Reputationally Clean",
  summary:
    "Apple demonstrates strong financial fundamentals with consistent earnings and healthy cash flow. Recent news sentiment is predominantly positive, driven by strong iPhone sales reports. The company's low debt-to-equity ratio and robust free cash flow provide a solid stability foundation.",
  counterfactual: {
    condition:
      "If the EU antitrust investigation resolves favorably and negative news returns to baseline",
    currentScore: 82,
    projectedScore: 91,
    currentSegment: "Fundamentally Strong, Reputationally Clean",
    projectedSegment: "Fundamentally Strong, Reputationally Clean",
  },
  analyzedAt: "2024-07-23T10:00:00Z",
  processingTime: 12400,
  cacheHit: false,
  dimensions: [
    {
      name: "Earnings Stability",
      category: "financial",
      score: 88,
      weight: 0.25,
      description: "Low variance in quarterly EPS over last 8 quarters",
      rawValue: "EPS σ = 0.12",
      trend: "stable",
    },
    {
      name: "Debt Health",
      category: "financial",
      score: 75,
      weight: 0.2,
      description: "Debt-to-equity ratio normalized against tech sector median",
      rawValue: "D/E = 1.87 (sector median: 1.45)",
      trend: "slightly_high",
    },
    {
      name: "Cash Flow Resilience",
      category: "financial",
      score: 92,
      weight: 0.2,
      description: "Free cash flow relative to total debt obligations",
      rawValue: "FCF/Debt = 0.42",
      trend: "strong",
    },
    {
      name: "Sentiment Momentum",
      category: "sentiment",
      score: 78,
      weight: 0.2,
      description:
        "Weighted average sentiment of last 30 days of news with recency decay",
      rawValue: "30d avg: +0.62",
      trend: "positive",
    },
    {
      name: "Controversy Exposure",
      category: "sentiment",
      score: 71,
      weight: 0.15,
      description:
        "Severity-weighted count of negative articles mentioning leadership, lawsuits, or regulatory action",
      rawValue: "3 articles, low severity",
      trend: "watchlist",
    },
  ],
  signals: {
    positive: [
      {
        text: "Strong Q3 iPhone revenue beat expectations by 8%",
        source: "Reuters",
        date: "2024-07-20",
        impact: 6,
      },
      {
        text: "Free cash flow increased 12% year-over-year",
        source: "SEC Filing",
        date: "2024-07-18",
        impact: 5,
      },
      {
        text: "Services revenue hit all-time high",
        source: "Bloomberg",
        date: "2024-07-19",
        impact: 4,
      },
    ],
    negative: [
      {
        text: "EU Digital Markets Act compliance deadline approaching",
        source: "Financial Times",
        date: "2024-07-22",
        impact: -4,
      },
      {
        text: "China market share declined 3% quarter-over-quarter",
        source: "IDC Report",
        date: "2024-07-21",
        impact: -3,
      },
    ],
  },
  newsTimeline: [
    { date: "2024-07-15", sentiment: 0.6, count: 5, headline: "New iPhone 16 leaks suggest design changes" },
    { date: "2024-07-16", sentiment: 0.5, count: 7, headline: "Apple Vision Pro sales tracking below expectations" },
    { date: "2024-07-17", sentiment: 0.4, count: 9, headline: "Analyst downgrades on China concerns" },
    { date: "2024-07-18", sentiment: 0.6, count: 6, headline: "Apple announces expanded buyback program" },
    { date: "2024-07-19", sentiment: 0.7, count: 10, headline: "Services revenue reaches new milestone" },
    { date: "2024-07-20", sentiment: 0.8, count: 15, headline: "Apple Q3 earnings crush expectations" },
    { date: "2024-07-21", sentiment: 0.5, count: 8, headline: "Apple's China strategy faces headwinds" },
    { date: "2024-07-22", sentiment: 0.3, count: 12, headline: "EU regulators set compliance deadline for Apple" },
  ],
}

const TSLA: StabilityScore = {
  ticker: "TSLA",
  companyName: "Tesla Inc.",
  exchange: "NASDAQ",
  score: 45,
  segment: "Financially Strong, Reputation Declining",
  summary:
    "Tesla maintains strong revenue growth and cash reserves, but faces mounting reputational headwinds. CEO-related controversies, declining market share in China, and quality concerns have driven negative sentiment momentum. Financial fundamentals remain solid but the disconnect between strong numbers and weak sentiment signals elevated instability risk.",
  counterfactual: {
    condition:
      "If CEO-related controversies subside and negative news volume drops by 50%",
    currentScore: 45,
    projectedScore: 64,
    currentSegment: "Financially Strong, Reputation Declining",
    projectedSegment: "Fundamentally Strong, Reputationally Clean",
  },
  analyzedAt: "2024-07-23T09:30:00Z",
  processingTime: 14200,
  cacheHit: false,
  dimensions: [
    {
      name: "Earnings Stability",
      category: "financial",
      score: 62,
      weight: 0.25,
      description: "Moderate variance in quarterly EPS due to pricing changes",
      rawValue: "EPS σ = 0.34",
      trend: "volatile",
    },
    {
      name: "Debt Health",
      category: "financial",
      score: 81,
      weight: 0.2,
      description: "Low debt-to-equity ratio for automotive sector",
      rawValue: "D/E = 0.69 (sector median: 1.82)",
      trend: "strong",
    },
    {
      name: "Cash Flow Resilience",
      category: "financial",
      score: 73,
      weight: 0.2,
      description: "Healthy free cash flow relative to capex commitments",
      rawValue: "FCF/Debt = 0.38",
      trend: "stable",
    },
    {
      name: "Sentiment Momentum",
      category: "sentiment",
      score: 22,
      weight: 0.2,
      description: "Sharp negative turn in sentiment over last 30 days",
      rawValue: "30d avg: -0.31",
      trend: "declining",
    },
    {
      name: "Controversy Exposure",
      category: "sentiment",
      score: 18,
      weight: 0.15,
      description: "High volume of leadership-related negative coverage",
      rawValue: "14 articles, high severity",
      trend: "critical",
    },
  ],
  signals: {
    positive: [
      {
        text: "Cybertruck deliveries exceeded internal targets",
        source: "Bloomberg",
        date: "2024-07-19",
        impact: 3,
      },
      {
        text: "Energy storage division revenue doubled year-over-year",
        source: "SEC Filing",
        date: "2024-07-17",
        impact: 4,
      },
    ],
    negative: [
      {
        text: "CEO compensation package controversy draws shareholder lawsuit",
        source: "WSJ",
        date: "2024-07-22",
        impact: -7,
      },
      {
        text: "Model Y quality ratings dropped in latest Consumer Reports",
        source: "Consumer Reports",
        date: "2024-07-21",
        impact: -4,
      },
      {
        text: "European market share declined to third position behind BYD and VW",
        source: "Reuters",
        date: "2024-07-20",
        impact: -5,
      },
      {
        text: "Autopilot investigation expanded by NHTSA",
        source: "CNBC",
        date: "2024-07-18",
        impact: -6,
      },
    ],
  },
  newsTimeline: [
    { date: "2024-07-15", sentiment: -0.3, count: 11, headline: "Former executives criticize company culture" },
    { date: "2024-07-16", sentiment: -0.1, count: 9, headline: "Price cuts weigh on margins outlook" },
    { date: "2024-07-17", sentiment: 0.3, count: 6, headline: "Tesla Energy division posts record quarter" },
    { date: "2024-07-18", sentiment: -0.5, count: 16, headline: "NHTSA expands Autopilot safety probe" },
    { date: "2024-07-19", sentiment: 0.4, count: 8, headline: "Cybertruck production ramps faster than expected" },
    { date: "2024-07-20", sentiment: -0.2, count: 14, headline: "Tesla loses ground in Europe to Chinese rivals" },
    { date: "2024-07-21", sentiment: -0.3, count: 12, headline: "Consumer Reports flags Model Y quality issues" },
    { date: "2024-07-22", sentiment: -0.4, count: 18, headline: "Tesla CEO faces new legal challenge over pay" },
  ],
}

// Lightweight variants for other tickers so every ticker resolves to something
function variant(base: StabilityScore, overrides: Partial<StabilityScore>): StabilityScore {
  return { ...base, ...overrides }
}

const NVDA: StabilityScore = variant(AAPL, {
  ticker: "NVDA",
  companyName: "NVIDIA Corp.",
  exchange: "NASDAQ",
  score: 89,
  segment: "Fundamentally Strong, Reputationally Clean",
  summary:
    "NVIDIA exhibits exceptional financial strength driven by surging AI demand. Operating margins, cash flow, and sentiment momentum all score in the top decile of the tech sector. Modest controversy exposure relating to export controls is the only meaningful headwind.",
  counterfactual: {
    condition: "If US-China export controls tighten further on advanced GPUs",
    currentScore: 89,
    projectedScore: 78,
    currentSegment: "Fundamentally Strong, Reputationally Clean",
    projectedSegment: "Fundamentally Strong, Reputationally Clean",
  },
})

const META: StabilityScore = variant(AAPL, {
  ticker: "META",
  companyName: "Meta Platforms",
  exchange: "NASDAQ",
  score: 71,
  segment: "Fundamentally Strong, Reputationally Clean",
  summary:
    "Meta's ad business continues to print cash, and Reality Labs losses are moderating. Sentiment has turned positive on AI investment narrative despite ongoing regulatory scrutiny across EU jurisdictions.",
  counterfactual: {
    condition: "If EU DMA fines materialize at upper end of projected range",
    currentScore: 71,
    projectedScore: 62,
    currentSegment: "Fundamentally Strong, Reputationally Clean",
    projectedSegment: "Financially Strong, Reputation Declining",
  },
})

const COIN: StabilityScore = variant(TSLA, {
  ticker: "COIN",
  companyName: "Coinbase Global",
  exchange: "NASDAQ",
  score: 38,
  segment: "Financially Weak, Sentiment Propped",
  summary:
    "Coinbase's revenue remains highly cyclical and tied to crypto market volatility. Current sentiment is buoyed by ETF inflows, but underlying financial resilience metrics flag elevated risk if trading volumes revert.",
  counterfactual: {
    condition: "If crypto trading volumes drop 30% in next quarter",
    currentScore: 38,
    projectedScore: 24,
    currentSegment: "Financially Weak, Sentiment Propped",
    projectedSegment: "Financially Weak, Sentiment Propped",
  },
})

const JPM: StabilityScore = variant(AAPL, {
  ticker: "JPM",
  companyName: "JPMorgan Chase",
  exchange: "NYSE",
  score: 76,
  segment: "Fundamentally Strong, Reputationally Clean",
  summary:
    "JPMorgan's fortress balance sheet, strong net interest margin, and disciplined risk management produce high stability. Sentiment is steady with no meaningful controversies in the trailing quarter.",
  counterfactual: {
    condition: "If yield curve steepens materially over next two quarters",
    currentScore: 76,
    projectedScore: 83,
    currentSegment: "Fundamentally Strong, Reputationally Clean",
    projectedSegment: "Fundamentally Strong, Reputationally Clean",
  },
})

const MSFT: StabilityScore = variant(AAPL, {
  ticker: "MSFT",
  companyName: "Microsoft Corp.",
  exchange: "NASDAQ",
  score: 85,
  segment: "Fundamentally Strong, Reputationally Clean",
  summary:
    "Microsoft shows broad-based strength: Azure growth, Copilot monetization, and enterprise stickiness. Sentiment is uniformly positive with limited controversy exposure.",
  counterfactual: {
    condition: "If AI capex cycle slows and cloud growth decelerates",
    currentScore: 85,
    projectedScore: 74,
    currentSegment: "Fundamentally Strong, Reputationally Clean",
    projectedSegment: "Fundamentally Strong, Reputationally Clean",
  },
})

const GOOGL: StabilityScore = variant(AAPL, {
  ticker: "GOOGL",
  companyName: "Alphabet Inc.",
  exchange: "NASDAQ",
  score: 73,
  segment: "Fundamentally Strong, Reputationally Clean",
  summary:
    "Alphabet's core search business remains dominant and highly cash-generative. Sentiment is mixed due to ongoing antitrust litigation, but financial fundamentals provide strong ballast.",
  counterfactual: {
    condition: "If DOJ remedy phase results in forced divestitures",
    currentScore: 73,
    projectedScore: 58,
    currentSegment: "Fundamentally Strong, Reputationally Clean",
    projectedSegment: "Financially Strong, Reputation Declining",
  },
})

export const MOCK_SCORES: Record<string, StabilityScore> = {
  AAPL,
  TSLA,
  NVDA,
  META,
  COIN,
  JPM,
  MSFT,
  GOOGL,
}

export function getScoreForTicker(raw: string): StabilityScore {
  const ticker = raw.toUpperCase()
  const existing = MOCK_SCORES[ticker]
  if (existing) return existing
  // Fabricate a deterministic middling score for unknown tickers
  const seed = ticker.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const score = 40 + (seed % 45)
  return variant(AAPL, {
    ticker,
    companyName: `${ticker} Holdings`,
    exchange: "NYSE",
    score,
    segment:
      score >= 70
        ? "Fundamentally Strong, Reputationally Clean"
        : score >= 50
          ? "Financially Strong, Reputation Declining"
          : "Financially Weak, Sentiment Propped",
    summary: `${ticker} is being analyzed with synthetic data. Connect an Alpha Vantage and NewsAPI key in Settings to get real stability intelligence for this ticker.`,
  })
}
