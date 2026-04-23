import { DimensionBar } from "@/components/shared/dimension-bar"
import { DimensionRadar } from "./dimension-radar"
import type { Dimension } from "@/lib/types"

export function DimensionBreakdown({ dimensions }: { dimensions: Dimension[] }) {
  const sorted = [...dimensions].sort((a, b) => b.weight - a.weight)

  return (
    <section aria-labelledby="dim-heading">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2
            id="dim-heading"
            className="text-lg font-semibold text-foreground"
          >
            Dimension Breakdown
          </h2>
          <p className="text-xs text-muted-foreground">
            How each factor contributes to the total score, sorted by weight.
          </p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          {sorted.map((d) => (
            <DimensionBar key={d.name} dimension={d} />
          ))}
        </div>
        <DimensionRadar dimensions={dimensions} />
      </div>
    </section>
  )
}
