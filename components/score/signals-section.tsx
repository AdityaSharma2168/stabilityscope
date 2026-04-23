import { TrendingDown, TrendingUp } from "lucide-react"
import { SignalCard } from "@/components/shared/signal-card"
import type { Signal } from "@/lib/types"

type Props = {
  positive: Signal[]
  negative: Signal[]
}

export function SignalsSection({ positive, negative }: Props) {
  return (
    <section aria-labelledby="signals-heading" className="space-y-4">
      <div>
        <h2
          id="signals-heading"
          className="text-lg font-semibold text-foreground"
        >
          Top Signals
        </h2>
        <p className="text-xs text-muted-foreground">
          The strongest recent signals influencing the score.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-card p-4 dark:border-slate-800">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-semibold text-foreground">
              Signals Pulling Score Up
            </h3>
            <span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
              {positive.length}
            </span>
          </div>
          <div className="space-y-2">
            {positive.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No positive signals detected in the last 30 days.
              </p>
            ) : (
              positive.map((s, i) => (
                <SignalCard key={`${s.text}-${i}`} signal={s} type="positive" />
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-card p-4 dark:border-slate-800">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <TrendingDown className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-semibold text-foreground">
              Signals Pulling Score Down
            </h3>
            <span className="ml-auto rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
              {negative.length}
            </span>
          </div>
          <div className="space-y-2">
            {negative.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No negative signals detected in the last 30 days.
              </p>
            ) : (
              negative.map((s, i) => (
                <SignalCard key={`${s.text}-${i}`} signal={s} type="negative" />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
