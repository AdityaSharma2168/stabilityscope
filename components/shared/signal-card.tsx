import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { relativeTime } from "@/lib/score-utils"
import type { Signal } from "@/lib/types"

type Props = {
  signal: Signal
  type: "positive" | "negative"
}

function signalDateForRelative(date: string): string {
  if (date.includes("T")) return date
  return `${date}T12:00:00Z`
}

export function SignalCard({ signal, type }: Props) {
  const positive = type === "positive"
  const shellClass = cn(
    "group flex items-start gap-3 rounded-lg border-l-2 border border-slate-200 bg-card p-3 pl-4 transition-colors hover:bg-accent dark:border-slate-800",
    positive ? "border-l-emerald-500" : "border-l-rose-500",
  )

  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug text-foreground">
          {signal.text}
        </p>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 font-medium">
            {signal.source}
          </span>
          <span>·</span>
          <span>{relativeTime(signalDateForRelative(signal.date))}</span>
          {signal.url ? (
            <ExternalLink className="ml-auto h-3 w-3 shrink-0 opacity-70 transition-opacity group-hover:opacity-100" />
          ) : null}
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-md border px-2 py-1 font-mono text-sm font-semibold tabular-nums",
          positive
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
        )}
      >
        {signal.impact > 0 ? `+${signal.impact}` : signal.impact}
      </span>
    </>
  )

  if (signal.url) {
    return (
      <a
        href={signal.url}
        target="_blank"
        rel="noopener noreferrer"
        className={shellClass}
      >
        {inner}
      </a>
    )
  }

  return <div className={shellClass}>{inner}</div>
}
