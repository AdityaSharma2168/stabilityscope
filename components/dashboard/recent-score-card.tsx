import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { relativeTime } from "@/lib/score-utils"
import { ScoreBadge } from "@/components/shared/score-badge"
import { SegmentBadge } from "@/components/shared/segment-badge"
import { ChangePill } from "@/components/shared/change-pill"
import type { RecentScore } from "@/lib/types"

export function RecentScoreCard({ score }: { score: RecentScore }) {
  return (
    <Link
      href={`/score/${score.ticker}`}
      className="group relative flex flex-col gap-3 rounded-xl border border-slate-200 bg-card p-4 shadow-sm transition-all hover:border-indigo-500/40 hover:shadow-md dark:border-slate-800 dark:hover:border-indigo-500/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xl font-bold tracking-tight text-foreground">
              {score.ticker}
            </span>
            <ChangePill change={score.change} />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {score.companyName}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>

      <div className="flex items-end justify-between gap-3">
        <ScoreBadge score={score.score} size="lg" />
        <span className="text-[11px] font-medium text-muted-foreground">
          {relativeTime(score.timestamp)}
        </span>
      </div>

      <SegmentBadge segment={score.segment} />
    </Link>
  )
}
