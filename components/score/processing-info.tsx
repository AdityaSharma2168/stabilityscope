import { CacheIndicator } from "@/components/shared/cache-indicator"
import { formatMs } from "@/lib/score-utils"

type Props = {
  processingTime: number
  cacheHit: boolean
  sourcesCount?: number
  jobId?: string
}

export function ProcessingInfo({
  processingTime,
  cacheHit,
  sourcesCount = 5,
  jobId,
}: Props) {
  const id = jobId ?? `job_${Math.random().toString(36).slice(2, 10)}`
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-card px-4 py-3 text-xs text-muted-foreground dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-3">
        <span>
          Analyzed in{" "}
          <span className="font-mono font-semibold text-foreground">
            {formatMs(processingTime)}
          </span>
        </span>
        <span>·</span>
        <span>
          <span className="font-mono font-semibold text-foreground">
            {sourcesCount}
          </span>{" "}
          data sources queried
        </span>
        <span>·</span>
        <CacheIndicator hit={cacheHit} />
      </div>
      <span className="font-mono text-[11px] text-muted-foreground/70">
        {id}
      </span>
    </footer>
  )
}
