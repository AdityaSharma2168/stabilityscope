/**
 * Known historical stability benchmarks used for manual validation and the
 * video walkthrough. Not enforced at runtime — the system simply produces a
 * score, and {@link findHistoricalCase} lets a validator compare that score
 * against an expected range for a known period in that company's history.
 *
 * `expectedRange` is `[min, max]` inclusive, both 0–100.
 */
export type HistoricalCase = {
  ticker: string
  period: string
  expectedRange: readonly [number, number]
  description: string
}

export const HISTORICAL_CASES: readonly HistoricalCase[] = [
  {
    ticker: "WE",
    period: "Q3 2019",
    expectedRange: [10, 30],
    description: "WeWork pre-IPO collapse",
  },
  {
    ticker: "SIVB",
    period: "Feb 2023",
    expectedRange: [15, 35],
    description: "SVB pre-March 2023 run",
  },
  {
    ticker: "AAPL",
    period: "Q4 2023",
    expectedRange: [70, 95],
    description: "Apple stable period",
  },
  {
    ticker: "TSLA",
    period: "Q4 2022",
    expectedRange: [30, 55],
    description: "Tesla Twitter turmoil",
  },
] as const

export function findHistoricalCase(ticker: string): HistoricalCase | null {
  const upper = ticker.trim().toUpperCase()
  return HISTORICAL_CASES.find((c) => c.ticker === upper) ?? null
}

export type HistoricalCaseValidation = {
  matched: true
  ticker: string
  period: string
  description: string
  expectedRange: readonly [number, number]
  actualScore: number
  withinRange: boolean
  delta: number
}

export type HistoricalCaseMiss = {
  matched: false
  ticker: string
}

/**
 * Compare a freshly produced stability score for `ticker` against a known
 * historical benchmark. Returns `{ matched: false }` when the ticker has no
 * registered case (the common path).
 */
export function validateAgainstHistoricalCase(
  ticker: string,
  actualScore: number,
): HistoricalCaseValidation | HistoricalCaseMiss {
  const match = findHistoricalCase(ticker)
  if (!match) {
    return { matched: false, ticker: ticker.toUpperCase() }
  }
  const [lo, hi] = match.expectedRange
  const withinRange = actualScore >= lo && actualScore <= hi
  const delta = withinRange
    ? 0
    : actualScore < lo
      ? actualScore - lo
      : actualScore - hi
  return {
    matched: true,
    ticker: match.ticker,
    period: match.period,
    description: match.description,
    expectedRange: match.expectedRange,
    actualScore,
    withinRange,
    delta,
  }
}
