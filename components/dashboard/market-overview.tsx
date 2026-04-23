import { TrendingDown, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

type Indicator = {
  label: string
  value: string
  change: number
  changeLabel: string
}

const INDICATORS: Indicator[] = [
  { label: "S&P 500", value: "5,634.61", change: 0.42, changeLabel: "+0.42%" },
  { label: "NASDAQ", value: "18,352.76", change: 0.61, changeLabel: "+0.61%" },
  { label: "VIX", value: "14.82", change: -2.31, changeLabel: "−2.31%" },
  { label: "10Y Yield", value: "4.21%", change: -0.04, changeLabel: "−4 bps" },
]

export function MarketOverview() {
  return (
    <section
      aria-label="Market overview"
      className="rounded-xl border border-slate-200 bg-card p-4 shadow-sm dark:border-slate-800"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Market Overview</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Live
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {INDICATORS.map((i) => {
          const up = i.change >= 0
          return (
            <div
              key={i.label}
              className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {i.label}
              </div>
              <div className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">
                {i.value}
              </div>
              <div
                className={cn(
                  "mt-0.5 flex items-center gap-1 font-mono text-xs",
                  up
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400",
                )}
              >
                {up ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {i.changeLabel}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
