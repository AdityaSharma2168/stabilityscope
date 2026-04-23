import Link from "next/link"

const QUICK_TICKERS = ["AAPL", "TSLA", "MSFT", "GOOGL", "NVDA", "META"]

export function QuickAccessPills() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">
        Quick access:
      </span>
      {QUICK_TICKERS.map((t) => (
        <Link
          key={t}
          href={`/score/${t}`}
          className="rounded-full border border-slate-200 bg-card px-3 py-1 font-mono text-xs font-semibold text-foreground transition-colors hover:border-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-600 dark:border-slate-800 dark:hover:text-indigo-400"
        >
          {t}
        </Link>
      ))}
    </div>
  )
}
