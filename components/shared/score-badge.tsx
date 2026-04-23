import { cn } from "@/lib/utils"
import { scoreColorClasses } from "@/lib/score-utils"

type Size = "sm" | "md" | "lg" | "xl"

const sizeClasses: Record<Size, string> = {
  sm: "text-lg font-semibold px-2 py-0.5",
  md: "text-2xl font-bold px-3 py-1",
  lg: "text-4xl font-bold px-4 py-1.5",
  xl: "text-6xl font-bold",
}

type Props = {
  score: number
  size?: Size
  className?: string
  showLabel?: boolean
  ariaLabel?: string
}

export function ScoreBadge({
  score,
  size = "md",
  className,
  showLabel = false,
  ariaLabel,
}: Props) {
  const colors = scoreColorClasses(score)
  return (
    <span
      aria-label={ariaLabel ?? `Stability score ${score}`}
      className={cn(
        "inline-flex items-baseline gap-1 rounded-md font-mono tabular-nums",
        size !== "xl" && colors.bg,
        size !== "xl" && "border",
        size !== "xl" && colors.border,
        colors.text,
        sizeClasses[size],
        className,
      )}
    >
      {score}
      {showLabel && size !== "xl" && (
        <span className="text-xs font-medium opacity-70">/100</span>
      )}
    </span>
  )
}
