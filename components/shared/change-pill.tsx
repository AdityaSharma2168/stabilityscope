import { ArrowDown, ArrowUp, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  change: number
  className?: string
}

export function ChangePill({ change, className }: Props) {
  const zero = change === 0
  const up = change > 0
  const Icon = zero ? Minus : up ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums",
        zero &&
          "border-slate-300 bg-slate-500/10 text-slate-600 dark:border-slate-700 dark:text-slate-400",
        up &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        !zero &&
          !up &&
          "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {up && "+"}
      {change}
    </span>
  )
}
