"use client"

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts"
import { cn } from "@/lib/utils"
import type { Dimension } from "@/lib/types"

function shortName(name: string): string {
  // Wrap long names onto two lines visually
  const parts = name.split(" ")
  if (parts.length <= 1) return name
  const mid = Math.ceil(parts.length / 2)
  return `${parts.slice(0, mid).join(" ")}\n${parts.slice(mid).join(" ")}`
}

type Props = {
  dimensions: Dimension[]
}

export function DimensionRadar({ dimensions }: Props) {
  const data = dimensions.map((d) => ({
    dimension: shortName(d.name),
    score: d.score,
    fullMark: 100,
  }))

  // Financial vs Sentiment weighted contribution
  const totalScore = dimensions.reduce((acc, d) => acc + d.score * d.weight, 0)
  const financialContribution = dimensions
    .filter((d) => d.category === "financial")
    .reduce((acc, d) => acc + d.score * d.weight, 0)
  const sentimentContribution = dimensions
    .filter((d) => d.category === "sentiment")
    .reduce((acc, d) => acc + d.score * d.weight, 0)
  const total = financialContribution + sentimentContribution || 1
  const finPct = (financialContribution / total) * 100
  const senPct = (sentimentContribution / total) * 100

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-card p-4 dark:border-slate-800">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          Dimension Profile
        </h3>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          Weighted total: {totalScore.toFixed(1)}
        </span>
      </div>

      <div className="mt-2 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid
              stroke="currentColor"
              className="text-slate-300 dark:text-slate-700"
            />
            <PolarAngleAxis
              dataKey="dimension"
              tick={{
                fill: "currentColor",
                fontSize: 10,
                fontWeight: 500,
              }}
              className="text-slate-600 dark:text-slate-400"
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <Radar
              name="Score"
              dataKey="score"
              stroke="#6366f1"
              fill="#6366f1"
              fillOpacity={0.3}
              strokeWidth={2}
              dot={{ r: 3, fill: "#6366f1" }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
          <span>Contribution to score</span>
        </div>
        <div className="flex h-6 w-full overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
          <div
            className="flex items-center justify-center bg-blue-500/80 text-[10px] font-semibold text-white"
            style={{ width: `${finPct}%` }}
          >
            {finPct >= 15 && `Financial ${finPct.toFixed(0)}%`}
          </div>
          <div
            className={cn(
              "flex items-center justify-center bg-violet-500/80 text-[10px] font-semibold text-white",
            )}
            style={{ width: `${senPct}%` }}
          >
            {senPct >= 15 && `Sentiment ${senPct.toFixed(0)}%`}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-blue-500" />
            Financial
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-violet-500" />
            Sentiment
          </span>
        </div>
      </div>
    </div>
  )
}
