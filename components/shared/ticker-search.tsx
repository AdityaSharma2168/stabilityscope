"use client"

import { Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Props = {
  size?: "default" | "large"
  placeholder?: string
  onSubmit?: (ticker: string) => void
  className?: string
  autoFocus?: boolean
}

export function TickerSearch({
  size = "default",
  placeholder,
  onSubmit,
  className,
  autoFocus,
}: Props) {
  const router = useRouter()
  const [value, setValue] = useState("")

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const ticker = value.trim().toUpperCase()
    if (!ticker) return
    if (onSubmit) {
      onSubmit(ticker)
    } else {
      router.push(`/score/${ticker}`)
    }
    setValue("")
  }

  const large = size === "large"

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("flex w-full items-center gap-2", className)}
      role="search"
    >
      <div className="relative flex-1">
        <Search
          className={cn(
            "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground",
            large ? "h-5 w-5" : "h-4 w-4",
          )}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          placeholder={
            placeholder ?? "Enter a ticker (e.g., AAPL, TSLA, MSFT)"
          }
          autoFocus={autoFocus}
          aria-label="Search ticker"
          className={cn(
            "w-full rounded-xl border border-slate-200 bg-card font-mono uppercase tracking-wide text-foreground shadow-sm transition-all placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-800",
            large
              ? "h-14 pl-11 pr-4 text-lg font-bold"
              : "h-10 pl-9 pr-3 text-sm font-semibold",
          )}
          maxLength={10}
        />
      </div>
      <Button
        type="submit"
        size={large ? "lg" : "default"}
        className={cn(
          "bg-indigo-600 font-semibold text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400",
          large && "h-14 px-6 text-base",
        )}
      >
        Analyze
      </Button>
    </form>
  )
}
