import { Zap, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  hit: boolean
  className?: string
}

export function CacheIndicator({ hit, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
        hit
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        className,
      )}
    >
      {hit ? <Zap className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      Cache {hit ? "Hit" : "Miss"}
    </span>
  )
}
