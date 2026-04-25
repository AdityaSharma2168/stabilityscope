/**
 * Tiingo's free fundamentals tier only covers the DOW 30. We restrict ticker
 * input to this list everywhere a user can type a symbol so the worker doesn't
 * burn a job on a request that will inevitably 404 on /tiingo/fundamentals.
 *
 * Production would swap in FMP (or a paid Tiingo plan) for full market coverage.
 */
export type Dow30Entry = {
  ticker: string
  name: string
}

export const DOW30: readonly Dow30Entry[] = [
  { ticker: "AAPL", name: "Apple Inc." },
  { ticker: "AMGN", name: "Amgen Inc." },
  { ticker: "AXP", name: "American Express" },
  { ticker: "BA", name: "Boeing Co." },
  { ticker: "CAT", name: "Caterpillar Inc." },
  { ticker: "CRM", name: "Salesforce Inc." },
  { ticker: "CSCO", name: "Cisco Systems" },
  { ticker: "CVX", name: "Chevron Corp." },
  { ticker: "DIS", name: "Walt Disney Co." },
  { ticker: "DOW", name: "Dow Inc." },
  { ticker: "GS", name: "Goldman Sachs" },
  { ticker: "HD", name: "Home Depot" },
  { ticker: "HON", name: "Honeywell" },
  { ticker: "IBM", name: "IBM Corp." },
  { ticker: "JNJ", name: "Johnson & Johnson" },
  { ticker: "JPM", name: "JPMorgan Chase" },
  { ticker: "KO", name: "Coca-Cola Co." },
  { ticker: "MCD", name: "McDonald's Corp." },
  { ticker: "MMM", name: "3M Company" },
  { ticker: "MRK", name: "Merck & Co." },
  { ticker: "MSFT", name: "Microsoft Corp." },
  { ticker: "NKE", name: "Nike Inc." },
  { ticker: "NVDA", name: "NVIDIA Corp." },
  { ticker: "PG", name: "Procter & Gamble" },
  { ticker: "TRV", name: "Travelers Companies" },
  { ticker: "UNH", name: "UnitedHealth Group" },
  { ticker: "V", name: "Visa Inc." },
  { ticker: "VZ", name: "Verizon Communications" },
  { ticker: "WBA", name: "Walgreens Boots Alliance" },
  { ticker: "WMT", name: "Walmart Inc." },
] as const

const DOW30_TICKERS = new Set(DOW30.map((entry) => entry.ticker))

export function isDow30Ticker(ticker: string): boolean {
  return DOW30_TICKERS.has(ticker.trim().toUpperCase())
}

export function findDow30(ticker: string): Dow30Entry | undefined {
  const upper = ticker.trim().toUpperCase()
  return DOW30.find((entry) => entry.ticker === upper)
}

/** Case-insensitive prefix/substring match on ticker or company name. */
export function searchDow30(query: string, limit = 8): Dow30Entry[] {
  const trimmed = query.trim()
  if (!trimmed) return DOW30.slice(0, limit)
  const lower = trimmed.toLowerCase()

  const startsWith: Dow30Entry[] = []
  const contains: Dow30Entry[] = []
  for (const entry of DOW30) {
    const t = entry.ticker.toLowerCase()
    const n = entry.name.toLowerCase()
    if (t.startsWith(lower) || n.startsWith(lower)) {
      startsWith.push(entry)
    } else if (t.includes(lower) || n.includes(lower)) {
      contains.push(entry)
    }
  }
  return [...startsWith, ...contains].slice(0, limit)
}

export const DOW30_NOT_SUPPORTED_MESSAGE =
  "Ticker not supported. Only DOW 30 companies are available."
