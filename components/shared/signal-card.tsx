import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { relativeTime } from "@/lib/score-utils"
import type { Signal } from "@/lib/types"

type Props = {
  signal: Signal
  type: "positive" | "negative"
}

export function SignalCard({ signal, type }: Props) {
  const positive = type === "positive"
  return (
    <Link
      href="#"
      className={cn(
        "group flex items-start gap-3 rounded-lg border-l-2 border border-slate-200 bg-card p-3 pl-4 transition-colors hover:bg-accent dark:border-slate-800",
        positive
          ? "border-l-emerald-500"
          : "border-l-rose-500",
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug text-foreground">
          {signal.text}
        </p>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 font-medium">
            {signal.source}
          </span>
          <span>·</span>
          <span>{relativeTime(signal.date + "T00:00:00Z")}</span>
          <ExternalLink className="ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-70" />
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
    </Link>
  )
}
