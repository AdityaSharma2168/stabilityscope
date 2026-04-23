import { ArrowRight, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { scoreColorClasses } from "@/lib/score-utils"
import { SegmentBadge } from "@/components/shared/segment-badge"
import type { Counterfactual } from "@/lib/types"

export function CounterfactualCard({ data }: { data: Counterfactual }) {
  const curColors = scoreColorClasses(data.currentScore)
  const projColors = scoreColorClasses(data.projectedScore)
  const diff = data.projectedScore - data.currentScore
  const up = diff > 0
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-amber-500/5 p-4 dark:border-slate-800 dark:bg-amber-500/[0.04]">
      <div className="absolute inset-y-0 left-0 w-1 bg-amber-500" />
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Counterfactual Scenario
            </span>
            <span
              className={cn(
                "font-mono text-xs font-semibold",
                up
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400",
              )}
            >
              {up ? "+" : ""}
              {diff}
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-foreground">
            {data.condition}, score would move from{" "}
            <span
              className={cn("font-mono font-bold", curColors.text)}
            >
              {data.currentScore}
            </span>{" "}
            <ArrowRight className="inline h-3 w-3" />{" "}
            <span
              className={cn("font-mono font-bold", projColors.text)}
            >
              {data.projectedScore}
            </span>
            {data.currentSegment !== data.projectedSegment &&
              ", shifting segment classification."}
          </p>
          {data.currentSegment !== data.projectedSegment && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <SegmentBadge segment={data.currentSegment} />
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <SegmentBadge segment={data.projectedSegment} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
