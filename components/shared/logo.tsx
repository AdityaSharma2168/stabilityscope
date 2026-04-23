import { cn } from "@/lib/utils"

type Props = {
  className?: string
  size?: number
  showWordmark?: boolean
}

export function Logo({ className, size = 28, showWordmark = true }: Props) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="relative flex shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white dark:bg-indigo-500"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-[65%] w-[65%]"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 17l4-4 3 3 7-7 4 4" />
          <path d="M14 6h5v5" />
        </svg>
      </div>
      {showWordmark && (
        <span className="text-base font-semibold tracking-tight text-foreground">
          Stability<span className="text-indigo-600 dark:text-indigo-400">Scope</span>
        </span>
      )}
    </div>
  )
}
