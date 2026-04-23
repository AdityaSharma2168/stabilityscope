import { Minus, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { scoreColorClasses } from "@/lib/score-utils"
import type { Dimension } from "@/lib/types"

type Props = {
  dimension: Dimension
}

const categoryClasses: Record<Dimension["category"], string> = {
  financial:
    "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  sentiment:
    "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
}

function TrendIcon({ trend }: { trend: Dimension["trend"] }) {
  const positive = ["strong", "positive", "stable"]
  const negative = ["declining", "volatile", "critical"]
  const caution = ["slightly_high", "watchlist"]
  if (positive.includes(trend))
    return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
  if (negative.includes(trend))
    return <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
  if (caution.includes(trend))
    return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
  return <Minus className="h-3.5 w-3.5 text-slate-500" />
}

export function DimensionBar({ dimension }: Props) {
  const colors = scoreColorClasses(dimension.score)
  return (
    <div className="rounded-xl border border-slate-200 bg-card p-4 dark:border-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">
              {dimension.name}
            </h4>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                categoryClasses[dimension.category],
              )}
            >
              {dimension.category}
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {Math.round(dimension.weight * 100)}%
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {dimension.description}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <TrendIcon trend={dimension.trend} />
          <span
            className={cn(
              "font-mono text-xl font-bold tabular-nums leading-none",
              colors.text,
            )}
          >
            {dimension.score}
          </span>
        </div>
      </div>
      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className={cn("h-full rounded-full transition-all", colors.fill)}
            style={{ width: `${dimension.score}%` }}
          />
        </div>
      </div>
      <div className="mt-2 font-mono text-[11px] text-muted-foreground">
        {dimension.rawValue}
      </div>
    </div>
  )
}
