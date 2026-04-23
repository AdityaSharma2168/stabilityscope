"use client"

import { ShieldCheck, Gauge, Clock3 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { StabilityScore } from "@/lib/types"

type Props = {
  score: StabilityScore
}

const LEVEL_STYLES: Record<
  "high" | "medium" | "low",
  { label: string; className: string }
> = {
  high: {
    label: "High",
    className:
      "bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-400",
  },
  medium: {
    label: "Medium",
    className:
      "bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/30 dark:text-amber-400",
  },
  low: {
    label: "Low",
    className:
      "bg-rose-500/10 text-rose-700 ring-1 ring-inset ring-rose-500/30 dark:text-rose-400",
  },
}

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-card p-5 shadow-sm dark:border-slate-800">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="flex-1 space-y-3 text-sm">{children}</div>
    </div>
  )
}

export function ValidationSection({ score }: Props) {
  const { confidence, sensitivity, historicalBenchmark } = score
  const level = LEVEL_STYLES[confidence.level]
  const deltaPositive = sensitivity.delta > 0
  const deltaNeutral = sensitivity.delta === 0
  const deltaLabel = `${deltaPositive ? "+" : ""}${sensitivity.delta}`

  return (
    <section
      aria-labelledby="validation-heading"
      className="space-y-4"
    >
      <div>
        <h2
          id="validation-heading"
          className="text-lg font-semibold text-foreground"
        >
          Validation &amp; Confidence
        </h2>
        <p className="text-xs text-muted-foreground">
          Signal quality, robustness of the score, and comparison to historical
          analogues.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Card 1 — Analysis Confidence */}
        <Card icon={ShieldCheck} title="Analysis Confidence">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                level.className,
              )}
            >
              {level.label}
            </span>
            <span className="text-xs text-muted-foreground">
              Based on {confidence.sourceCount} data sources
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {confidence.description}
          </p>
        </Card>

        {/* Card 2 — Score Sensitivity */}
        <Card icon={Gauge} title="Score Sensitivity">
          <p className="text-sm text-foreground">
            Removing{" "}
            <span className="font-medium">
              &ldquo;{sensitivity.maxImpactSignal}&rdquo;
            </span>{" "}
            changes score by{" "}
            <span
              className={cn(
                "font-mono font-semibold",
                deltaNeutral
                  ? "text-muted-foreground"
                  : deltaPositive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400",
              )}
            >
              {deltaLabel} points
            </span>
          </p>
          <div className="flex items-center gap-2 font-mono text-sm tabular-nums">
            <span className="text-foreground">{score.score}</span>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground">{sensitivity.scoreWithout}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            No single signal accounts for more than{" "}
            {sensitivity.singleSignalMaxPercent}% of the total score
          </p>
        </Card>

        {/* Card 3 — Historical Comparison */}
        <Card icon={Clock3} title="Historical Comparison">
          <p className="text-sm leading-relaxed text-foreground">
            {historicalBenchmark.comparison}
          </p>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-foreground dark:bg-slate-800">
              {historicalBenchmark.historicalScore}
            </span>
            <span className="text-xs text-muted-foreground">
              {historicalBenchmark.period}
            </span>
          </div>
        </Card>
      </div>
    </section>
  )
}
