import Link from "next/link"
import { DOW30 } from "@/lib/dow30"

const QUICK_TICKERS: ReadonlyArray<string> = [
  "AAPL",
  "MSFT",
  "JPM",
  "V",
  "NVDA",
  "JNJ",
]

const TICKER_NAME_MAP = new Map(DOW30.map((entry) => [entry.ticker, entry.name]))

export function QuickAccessPills() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">
        Quick access:
      </span>
      {QUICK_TICKERS.map((ticker) => (
        <Link
          key={ticker}
          href={`/score/${ticker}`}
          title={TICKER_NAME_MAP.get(ticker) ?? ticker}
          className="rounded-full border border-slate-200 bg-card px-3 py-1 font-mono text-xs font-semibold text-foreground transition-colors hover:border-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-600 dark:border-slate-800 dark:hover:text-indigo-400"
        >
          {ticker}
        </Link>
      ))}
    </div>
  )
}
