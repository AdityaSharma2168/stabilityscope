"use client"

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/score-utils"
import type { NewsPoint } from "@/lib/types"

function formatShort(date: string): string {
  const d = new Date(date)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

type Props = {
  timeline: NewsPoint[]
}

export function NewsTimeline({ timeline }: Props) {
  const hasData = Array.isArray(timeline) && timeline.length > 0

  if (!hasData) {
    return (
      <section aria-labelledby="news-heading" className="space-y-4">
        <div>
          <h2 id="news-heading" className="text-lg font-semibold text-foreground">
            News Sentiment Timeline
          </h2>
          <p className="text-xs text-muted-foreground">
            Sentiment trajectory across the analysis window. Dot size reflects
            article volume.
          </p>
        </div>
        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-card px-6 py-16 dark:border-slate-800">
          <p className="text-center text-sm text-muted-foreground">
            No news data available for this analysis period.
          </p>
        </div>
      </section>
    )
  }

  const sorted = [...timeline].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )

  const reversed = [...sorted].reverse()

  return (
    <section aria-labelledby="news-heading" className="space-y-4">
      <div>
        <h2 id="news-heading" className="text-lg font-semibold text-foreground">
          News Sentiment Timeline
        </h2>
        <p className="text-xs text-muted-foreground">
          Sentiment trajectory across the analysis window. Dot size reflects
          article volume.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-card p-4 dark:border-slate-800">
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={sorted}
              margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="sentPos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="sentNeg" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="currentColor"
                className="text-slate-200 dark:text-slate-800"
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatShort}
                stroke="currentColor"
                className="text-slate-500"
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                domain={[-1, 1]}
                stroke="currentColor"
                className="text-slate-500"
                fontSize={11}
                tickLine={false}
                ticks={[-1, -0.5, 0, 0.5, 1]}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null
                  const p = payload[0].payload as NewsPoint
                  const positive = p.sentiment >= 0
                  return (
                    <div className="rounded-lg border border-slate-200 bg-popover p-3 shadow-md dark:border-slate-800">
                      <div className="text-xs font-medium text-muted-foreground">
                        {formatDate(p.date)}
                      </div>
                      <div
                        className={cn(
                          "mt-1 font-mono text-sm font-semibold",
                          positive
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400",
                        )}
                      >
                        Sentiment: {p.sentiment > 0 ? "+" : ""}
                        {p.sentiment.toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.count} articles
                      </div>
                      <div className="mt-1 max-w-[240px] text-xs text-foreground">
                        {p.headline}
                      </div>
                    </div>
                  )
                }}
              />
              <ReferenceLine
                y={0}
                stroke="currentColor"
                className="text-slate-400 dark:text-slate-600"
                strokeDasharray="2 2"
              />
              <Area
                type="monotone"
                dataKey="sentiment"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#sentPos)"
                activeDot={{
                  r: 5,
                  fill: "#6366f1",
                  stroke: "#fff",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-card dark:border-slate-800">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent Headlines
          </h3>
          <span className="text-[11px] text-muted-foreground">
            {sorted.length} entries
          </span>
        </div>
        <ul className="max-h-72 divide-y divide-slate-200 overflow-y-auto dark:divide-slate-800">
          {reversed.map((p) => {
            const positive = p.sentiment >= 0
            return (
              <li
                key={p.date}
                className="flex items-start gap-3 px-4 py-3 hover:bg-accent"
              >
                <span
                  className={cn(
                    "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                    positive ? "bg-emerald-500" : "bg-rose-500",
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">
                    {p.headline}
                  </p>
                  <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{formatDate(p.date)}</span>
                    <span>·</span>
                    <span>{p.count} articles</span>
                    <span>·</span>
                    <span
                      className={cn(
                        "font-mono",
                        positive
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {p.sentiment > 0 ? "+" : ""}
                      {p.sentiment.toFixed(2)}
                    </span>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
