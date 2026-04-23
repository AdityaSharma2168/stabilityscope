import { ScoreGauge } from "@/components/shared/score-gauge"
import { SegmentBadge } from "@/components/shared/segment-badge"
import { CounterfactualCard } from "./counterfactual-card"
import type { StabilityScore } from "@/lib/types"

export function ScoreHero({ data }: { data: StabilityScore }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-card shadow-sm dark:border-slate-800">
      <div className="grid gap-6 p-6 md:grid-cols-[minmax(260px,320px)_1fr] md:gap-8 md:p-8">
        <div className="flex flex-col items-center justify-center gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 md:border-b-0 md:border-r md:pb-0 md:pr-8">
          <ScoreGauge score={data.score} size={260} />
          <SegmentBadge segment={data.segment} size="md" />
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Stability Summary
            </h3>
            <p className="mt-2 text-base leading-relaxed text-foreground text-pretty md:text-[15px]">
              {data.summary}
            </p>
          </div>
          <CounterfactualCard data={data.counterfactual} />
        </div>
      </div>
    </section>
  )
}
