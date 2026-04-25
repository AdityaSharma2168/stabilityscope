import { logger } from "../../lib/logger"
import type { CompanyNewsArticle } from "../apis/newsapi"
import type { TrendDataPoint } from "../apis/serpapi"
import type { Dimension, DimensionTrend } from "../../lib/types"

export const DIMENSION_WEIGHTS = {
  earningsStability: 0.22,
  debtHealth: 0.18,
  cashFlowResilience: 0.18,
  sentimentMomentum: 0.17,
  controversyExposure: 0.15,
  publicInterestTrend: 0.1,
} as const

const SECTOR_DEBT_TO_EQUITY_MEDIAN: Record<string, number> = {
  technology: 1.5,
  tech: 1.5,
  consumer: 1.2,
  industrial: 1.4,
  financials: 2.5,
  banks: 2.5,
  insurance: 1.8,
  healthcare: 1.0,
  energy: 1.6,
  utilities: 1.7,
  materials: 1.3,
  staples: 1.3,
  telecom: 1.6,
  default: 1.5,
}

/**
 * Per-sector calibration of the maximum "expected" EPS σ. The absolute values
 * were doubled from the original calibration after observing that blue-chips
 * (AAPL σ≈0.59, MSFT σ≈0.71) were collapsing to 0 under the old `maxSigma=0.5`.
 *
 * The score curve in {@link epsStabilityScore} is normalized by `r = σ/maxSigma`,
 * so a sector's maxSigma sets where the 80 / 50 / 0 anchors land on the σ axis:
 *   tech (maxSigma=1.0):  σ=0.3 → 80, σ=0.5 → 50, σ=1.5 → 0
 *   energy (maxSigma=1.5): σ=0.45 → 80, σ=0.75 → 50, σ=2.25 → 0
 */
const SECTOR_EPS_SIGMA_MAX: Record<string, number> = {
  technology: 1.0,
  tech: 1.0,
  consumer: 1.0,
  financials: 1.2,
  banks: 1.2,
  insurance: 1.2,
  energy: 1.5,
  materials: 1.2,
  utilities: 0.6,
  healthcare: 1.0,
  telecom: 0.8,
  staples: 0.6,
  default: 1.0,
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  const variance =
    nums.reduce((sum, x) => sum + (x - mean) ** 2, 0) / Math.max(1, nums.length - 1)
  return Math.sqrt(variance)
}

function normalizeSector(sector: string | undefined): string {
  return (sector ?? "").toLowerCase().trim()
}

function lookupSector<T>(
  sector: string | undefined,
  table: Record<string, T>,
  fallback: T,
): T {
  const key = normalizeSector(sector)
  if (!key) return fallback
  if (key in table) return table[key]
  for (const [needle, value] of Object.entries(table)) {
    if (needle === "default") continue
    if (key.includes(needle)) return value
  }
  return fallback
}

/**
 * Piecewise-linear EPS-stability normalization, expressed in σ relative to
 * the sector's `maxExpectedSigma` so the curve stays calibrated when sector
 * volatility differs.
 *
 * Anchors (in normalized r = σ / maxSigma):
 *   r = 0.0 → 100  (perfect EPS consistency)
 *   r = 0.3 → 80   (low variance, blue-chip range)
 *   r = 0.5 → 50   (typical market variance)
 *   r = 1.5 → 0    (extreme volatility / earnings flips)
 *
 * For tech (`maxSigma = 1.0`) these anchors map to the absolute σ targets in
 * the spec: σ < 0.3 ⇒ 80+, σ ≈ 0.5 ⇒ ~50, σ ≥ 1.5 ⇒ ~0. AAPL (σ ≈ 0.59) lands
 * around 45 and MSFT (σ ≈ 0.71) around 39, which is more realistic than the
 * old linear formula's 0 at maxSigma = 0.5.
 */
function epsStabilityScore(sigma: number, maxSigma: number): number {
  if (!Number.isFinite(sigma) || !Number.isFinite(maxSigma) || maxSigma <= 0) {
    return 50
  }
  const r = Math.max(0, sigma) / maxSigma
  let score: number
  if (r <= 0.3) {
    score = 100 - (r / 0.3) * 20
  } else if (r <= 0.5) {
    score = 80 - ((r - 0.3) / 0.2) * 30
  } else if (r <= 1.5) {
    score = 50 - ((r - 0.5) / 1.0) * 50
  } else {
    score = 0
  }
  return Math.round(clamp(score, 0, 100))
}

function logDimension(name: string, score: number, rawValue: string, weight: number): void {
  logger.info({
    action: "dimension_computed",
    dimension: name,
    score,
    rawValue,
    weight,
  })
}

export type EarningsStabilityInput = {
  /** Quarterly EPS values, most recent first or last — order doesn't matter for σ. */
  epsValues: number[]
  sector?: string
  /** Override the calibrated max σ when caller has sector-specific knowledge. */
  maxExpectedSigma?: number
}

/**
 * Earnings Stability — weight 0.22.
 * Lower σ across the most recent 8 quarters → higher score.
 * If fewer than 4 quarters are available, confidence is reduced via the
 * partial flag and we still score from the available data so the pipeline
 * stays live.
 */
export function computeEarningsStability(input: EarningsStabilityInput): {
  dimension: Dimension
  partial: boolean
} {
  const weight = DIMENSION_WEIGHTS.earningsStability
  const eps = input.epsValues.filter((n) => Number.isFinite(n)).slice(0, 8)
  const sector = normalizeSector(input.sector)
  const maxSigma =
    input.maxExpectedSigma ?? lookupSector(sector, SECTOR_EPS_SIGMA_MAX, SECTOR_EPS_SIGMA_MAX.default)

  const partial = eps.length < 4

  let score: number
  let rawValue: string
  let trend: DimensionTrend

  if (eps.length < 2) {
    score = 50
    rawValue = "Insufficient EPS history"
    trend = "stable"
  } else {
    const sigma = stdDev(eps)
    score = epsStabilityScore(sigma, maxSigma)
    rawValue = `σ ${sigma.toFixed(3)} (n=${eps.length}, max σ=${maxSigma})`
    trend = sigma < maxSigma * 0.3 ? "strong" : sigma < maxSigma * 0.7 ? "stable" : "volatile"
  }

  const description = partial
    ? `EPS variance from ${eps.length} quarter${eps.length === 1 ? "" : "s"} (limited history reduces confidence).`
    : "EPS variance over recent quarters; lower variance signals predictable earnings."

  logDimension("Earnings Stability", score, rawValue, weight)

  return {
    dimension: {
      name: "Earnings Stability",
      category: "financial",
      score,
      weight,
      description,
      rawValue,
      trend,
    },
    partial,
  }
}

export type DebtHealthInput = {
  totalDebt: number | null
  totalEquity: number | null
  sector?: string
}

/**
 * Debt Health — weight 0.18.
 * D/E ratio normalized against a sector median; negative equity → score = 10.
 */
export function computeDebtHealth(input: DebtHealthInput): {
  dimension: Dimension
  partial: boolean
} {
  const weight = DIMENSION_WEIGHTS.debtHealth
  const sector = normalizeSector(input.sector)
  const sectorMedian = lookupSector(
    sector,
    SECTOR_DEBT_TO_EQUITY_MEDIAN,
    SECTOR_DEBT_TO_EQUITY_MEDIAN.default,
  )

  const { totalDebt, totalEquity } = input
  const partial =
    totalDebt === null || totalEquity === null || !Number.isFinite(totalDebt) || !Number.isFinite(totalEquity)

  let score: number
  let rawValue: string
  let trend: DimensionTrend

  if (totalEquity !== null && totalEquity < 0) {
    score = 10
    rawValue = `D/E n/a (negative equity ${totalEquity.toFixed(0)})`
    trend = "critical"
  } else if (partial) {
    score = 50
    rawValue = "D/E unavailable"
    trend = "stable"
  } else {
    const debtToEquity = totalEquity === 0 ? Number.POSITIVE_INFINITY : totalDebt! / totalEquity!
    if (debtToEquity < 0) {
      score = 10
      rawValue = `D/E ${debtToEquity.toFixed(2)} (negative)`
      trend = "critical"
    } else {
      const ratio = (debtToEquity - sectorMedian) / sectorMedian
      score = Math.round(clamp(100 * (1 - ratio), 0, 100))
      rawValue = `D/E ${debtToEquity.toFixed(2)} vs sector ${sectorMedian.toFixed(2)}`
      trend =
        debtToEquity < sectorMedian * 0.6
          ? "strong"
          : debtToEquity < sectorMedian * 1.1
            ? "stable"
            : debtToEquity < sectorMedian * 1.5
              ? "slightly_high"
              : "watchlist"
    }
  }

  logDimension("Debt Health", score, rawValue, weight)

  return {
    dimension: {
      name: "Debt Health",
      category: "financial",
      score,
      weight,
      description: partial
        ? "Leverage proxy unavailable from filings; using neutral baseline."
        : "Total debt vs total equity, benchmarked to sector median.",
      rawValue,
      trend,
    },
    partial,
  }
}

export type CashFlowResilienceInput = {
  freeCashFlow: number | null
  totalDebt: number | null
}

/**
 * Cash Flow Resilience — weight 0.18.
 * FCF / total debt; ratio of 0.5 maps to a score of 100.
 */
export function computeCashFlowResilience(input: CashFlowResilienceInput): {
  dimension: Dimension
  partial: boolean
} {
  const weight = DIMENSION_WEIGHTS.cashFlowResilience
  const { freeCashFlow, totalDebt } = input

  const partial =
    freeCashFlow === null ||
    totalDebt === null ||
    !Number.isFinite(freeCashFlow) ||
    !Number.isFinite(totalDebt)

  let score: number
  let rawValue: string
  let trend: DimensionTrend

  if (partial) {
    score = 50
    rawValue = "FCF or debt unavailable"
    trend = "stable"
  } else if (totalDebt! <= 0) {
    score = 100
    rawValue = `FCF ${freeCashFlow!.toFixed(0)} / debt ~0`
    trend = "strong"
  } else {
    const ratio = freeCashFlow! / totalDebt!
    if (ratio < 0) {
      score = 0
      trend = "critical"
    } else {
      score = Math.round(clamp(ratio * 200, 0, 100))
      trend = ratio > 0.4 ? "strong" : ratio > 0.2 ? "positive" : ratio > 0.05 ? "stable" : "watchlist"
    }
    rawValue = `FCF/Debt ${ratio.toFixed(3)}`
  }

  logDimension("Cash Flow Resilience", score, rawValue, weight)

  return {
    dimension: {
      name: "Cash Flow Resilience",
      category: "financial",
      score,
      weight,
      description: partial
        ? "Free cash flow vs total debt unavailable; using neutral baseline."
        : "Free cash flow relative to total debt — capacity to service obligations.",
      rawValue,
      trend,
    },
    partial,
  }
}

export type SentimentArticleScored = {
  /** OpenAI-rated sentiment in [-1, +1]. */
  sentiment: number
  publishedAt: string
  credibilityWeight: number
}

/**
 * Sentiment Momentum — weight 0.17.
 * Per-day weighted sentiment with EWMA recency decay (0.9 / day) and a 3x
 * boost for articles in the last 7 days. Across days, we use the MEDIAN
 * (not mean) to resist outliers, then map [-1, +1] to [0, 100].
 */
export function computeSentimentMomentum(articles: SentimentArticleScored[]): {
  dimension: Dimension
  partial: boolean
} {
  const weight = DIMENSION_WEIGHTS.sentimentMomentum
  const partial = articles.length === 0

  let score: number
  let rawValue: string
  let trend: DimensionTrend

  if (partial) {
    score = 50
    rawValue = "No articles available"
    trend = "stable"
  } else {
    const now = Date.now()
    const byDay = new Map<string, { sumWeighted: number; sumWeight: number }>()
    for (const article of articles) {
      const published = new Date(article.publishedAt || now)
      const ts = Number.isFinite(published.getTime()) ? published.getTime() : now
      const day = new Date(ts).toISOString().slice(0, 10)
      const daysAgo = Math.max(0, (now - ts) / 86_400_000)
      const decay = Math.pow(0.9, daysAgo)
      const recencyBoost = daysAgo <= 7 ? 3 : 1
      const w = decay * recencyBoost * Math.max(0.1, article.credibilityWeight)
      const prev = byDay.get(day) ?? { sumWeighted: 0, sumWeight: 0 }
      prev.sumWeighted += article.sentiment * w
      prev.sumWeight += w
      byDay.set(day, prev)
    }

    const dailySentiments: number[] = []
    for (const value of byDay.values()) {
      if (value.sumWeight > 0) {
        dailySentiments.push(clamp(value.sumWeighted / value.sumWeight, -1, 1))
      }
    }

    const med = median(dailySentiments)
    score = Math.round(clamp(((med + 1) / 2) * 100, 0, 100))
    rawValue = `median ${med.toFixed(2)} across ${dailySentiments.length} day${dailySentiments.length === 1 ? "" : "s"}`
    trend = med > 0.15 ? "positive" : med < -0.15 ? "declining" : "stable"
  }

  logDimension("Sentiment Momentum", score, rawValue, weight)

  return {
    dimension: {
      name: "Sentiment Momentum",
      category: "sentiment",
      score,
      weight,
      description: partial
        ? "No recent news coverage; using neutral baseline."
        : "EWMA-weighted median sentiment with 3x recency boost on the past week.",
      rawValue,
      trend,
    },
    partial,
  }
}

const LEADERSHIP_KEYWORDS = [
  "ceo",
  "executive",
  "chairman",
  "cfo",
  "founder",
  "resign",
  "ousted",
  "fired",
  "stepping down",
]

const REGULATORY_KEYWORDS = [
  "sec ",
  "doj",
  "ftc",
  "regulator",
  "regulatory",
  "antitrust",
  "subpoena",
  "investigation",
  "probe",
  "fine",
  "penalty",
]

const LITIGATION_KEYWORDS = [
  "lawsuit",
  "litigation",
  "class action",
  "settlement",
  "indictment",
  "criminal",
  "fraud",
  "scandal",
  "breach",
]

function classifyControversy(article: CompanyNewsArticle): {
  hit: boolean
  severity: 1 | 2 | 3
  reason: string
} {
  const text = `${article.title} ${article.description}`.toLowerCase()
  const hasLeadership = LEADERSHIP_KEYWORDS.some((k) => text.includes(k))
  const hasRegulatory = REGULATORY_KEYWORDS.some((k) => text.includes(k))
  const hasLitigation = LITIGATION_KEYWORDS.some((k) => text.includes(k))

  if (!hasLeadership && !hasRegulatory && !hasLitigation) {
    return { hit: false, severity: 1, reason: "" }
  }

  if (hasLeadership && (hasRegulatory || hasLitigation)) {
    return { hit: true, severity: 3, reason: "leadership_legal" }
  }
  if (hasLeadership || (hasRegulatory && hasLitigation)) {
    return { hit: true, severity: 3, reason: "leadership_or_combined" }
  }
  if (hasRegulatory || hasLitigation) {
    return { hit: true, severity: 2, reason: "regulatory_or_litigation" }
  }
  return { hit: true, severity: 1, reason: "minor" }
}

/**
 * Controversy Exposure — weight 0.15.
 * Sum (severity × source_credibility_weight) over the top-5 most impactful
 * negative articles. Capped at 5 articles so a single news cycle can't
 * dominate. More controversy → lower score.
 */
export function computeControversyExposure(articles: CompanyNewsArticle[]): {
  dimension: Dimension
  partial: boolean
} {
  const weight = DIMENSION_WEIGHTS.controversyExposure
  const partial = articles.length === 0

  let score: number
  let rawValue: string
  let trend: DimensionTrend

  if (partial) {
    score = 60
    rawValue = "No articles available"
    trend = "stable"
  } else {
    const ranked = articles
      .map((article) => {
        const classification = classifyControversy(article)
        const impact = classification.severity * Math.max(0.5, article.credibilityWeight)
        return { article, classification, impact }
      })
      .filter((row) => row.classification.hit)
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 5)

    const sumImpact = ranked.reduce((acc, row) => acc + row.impact, 0)
    // Worst case: 5 articles × severity 3 × tier-1 weight 1.5 = 22.5
    const maxImpact = 5 * 3 * 1.5
    score = Math.round(clamp(100 - (sumImpact / maxImpact) * 100, 0, 100))
    rawValue = `${ranked.length} hit${ranked.length === 1 ? "" : "s"} (impact ${sumImpact.toFixed(2)}/${maxImpact})`
    trend = score >= 75 ? "stable" : score >= 50 ? "watchlist" : score >= 30 ? "declining" : "critical"
  }

  logDimension("Controversy Exposure", score, rawValue, weight)

  return {
    dimension: {
      name: "Controversy Exposure",
      category: "sentiment",
      score,
      weight,
      description: partial
        ? "No coverage to assess controversy; using mildly cautious baseline."
        : "Severity × source credibility for leadership, lawsuit, and regulatory articles (capped at 5).",
      rawValue,
      trend,
    },
    partial,
  }
}

export type PublicInterestTrendInput = {
  /** Google Trends data points covering ~90 days. */
  series: TrendDataPoint[] | null
}

/**
 * Public Interest Trend — weight 0.10.
 * Linear regression slope of Google Trends interest over 90 days.
 * Rising → 60-80, stable → 50, declining → 20-40.
 * No data → 50 with reduced confidence.
 */
export function computePublicInterestTrend(input: PublicInterestTrendInput): {
  dimension: Dimension
  partial: boolean
} {
  const weight = DIMENSION_WEIGHTS.publicInterestTrend
  const series = input.series ?? []
  const partial = series.length < 3

  let score: number
  let rawValue: string
  let trend: DimensionTrend

  if (partial) {
    score = 50
    rawValue = series.length === 0 ? "No trends data" : `Only ${series.length} points`
    trend = "stable"
  } else {
    const xs = series.map((_, i) => i)
    const ys = series.map((p) => (Number.isFinite(p.value) ? p.value : 0))
    const n = xs.length
    const meanX = xs.reduce((a, b) => a + b, 0) / n
    const meanY = ys.reduce((a, b) => a + b, 0) / n
    let num = 0
    let den = 0
    for (let i = 0; i < n; i += 1) {
      const dx = xs[i] - meanX
      num += dx * (ys[i] - meanY)
      den += dx * dx
    }
    const slope = den === 0 ? 0 : num / den
    const normalizedSlope = meanY === 0 ? 0 : (slope * n) / meanY
    if (normalizedSlope > 0.05) {
      score = Math.round(clamp(60 + Math.min(20, normalizedSlope * 80), 60, 80))
      trend = "positive"
    } else if (normalizedSlope < -0.05) {
      score = Math.round(clamp(40 - Math.min(20, Math.abs(normalizedSlope) * 80), 20, 40))
      trend = "declining"
    } else {
      score = Math.round(clamp(50 + normalizedSlope * 100, 45, 55))
      trend = "stable"
    }
    rawValue = `slope ${slope.toFixed(2)} / 90d (norm ${normalizedSlope.toFixed(2)})`
  }

  logDimension("Public Interest Trend", score, rawValue, weight)

  return {
    dimension: {
      name: "Public Interest Trend",
      category: "sentiment",
      score,
      weight,
      description: partial
        ? "Google Trends unavailable; neutral baseline reduces confidence."
        : "Linear-regression slope of search interest over the last 90 days.",
      rawValue,
      trend,
    },
    partial,
  }
}

export type ComputeAllDimensionsInput = {
  earnings: EarningsStabilityInput
  debt: DebtHealthInput
  cashFlow: CashFlowResilienceInput
  sentimentArticles: SentimentArticleScored[]
  controversyArticles: CompanyNewsArticle[]
  trends: PublicInterestTrendInput
}

export type ComputeAllDimensionsResult = {
  dimensions: Dimension[]
  partial: {
    earnings: boolean
    debt: boolean
    cashFlow: boolean
    sentiment: boolean
    controversy: boolean
    trends: boolean
  }
}

/** Compute all six dimensions in their canonical weighted order. */
export function computeAllDimensions(
  input: ComputeAllDimensionsInput,
): ComputeAllDimensionsResult {
  const earnings = computeEarningsStability(input.earnings)
  const debt = computeDebtHealth(input.debt)
  const cashFlow = computeCashFlowResilience(input.cashFlow)
  const sentiment = computeSentimentMomentum(input.sentimentArticles)
  const controversy = computeControversyExposure(input.controversyArticles)
  const trends = computePublicInterestTrend(input.trends)

  return {
    dimensions: [
      earnings.dimension,
      debt.dimension,
      cashFlow.dimension,
      sentiment.dimension,
      controversy.dimension,
      trends.dimension,
    ],
    partial: {
      earnings: earnings.partial,
      debt: debt.partial,
      cashFlow: cashFlow.partial,
      sentiment: sentiment.partial,
      controversy: controversy.partial,
      trends: trends.partial,
    },
  }
}
