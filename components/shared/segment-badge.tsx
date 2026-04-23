import { cn } from "@/lib/utils"

type Props = {
  segment: string
  className?: string
  size?: "sm" | "md"
}

function segmentClasses(segment: string): string {
  const s = segment.toLowerCase()
  if (s.includes("reputationally clean") && s.includes("fundamentally strong"))
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
  if (s.includes("reputation declining"))
    return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
  if (s.includes("sentiment propped"))
    return "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
  if (s.includes("financially weak"))
    return "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
  return "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30"
}

export function SegmentBadge({ segment, className, size = "sm" }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium whitespace-normal",
        size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm",
        segmentClasses(segment),
        className,
      )}
    >
      {segment}
    </span>
  )
}
