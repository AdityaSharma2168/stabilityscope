"use client"

import Link from "next/link"
import { ChevronRight, RefreshCw, Star } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { relativeTime } from "@/lib/score-utils"
import type { StabilityScore } from "@/lib/types"

type Props = {
  data: StabilityScore
  onRefresh: () => void
}

export function ScoreHeaderBar({ data, onRefresh }: Props) {
  const [inWatchlist, setInWatchlist] = useState(false)

  const toggle = () => {
    const next = !inWatchlist
    setInWatchlist(next)
    toast.success(
      next
        ? `${data.ticker} added to your watchlist`
        : `${data.ticker} removed from watchlist`,
    )
  }

  return (
    <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex items-center gap-1 text-xs text-muted-foreground">
            <li>
              <Link href="/dashboard" className="hover:text-foreground">
                Dashboard
              </Link>
            </li>
            <ChevronRight className="h-3 w-3" />
            <li className="font-mono font-semibold text-foreground">
              {data.ticker}
            </li>
          </ol>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {data.ticker}
          </h1>
          <span className="rounded-md border border-slate-200 bg-muted px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground dark:border-slate-800">
            {data.exchange}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.companyName}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          Analyzed {relativeTime(data.analyzedAt)}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={toggle}
          className={cn(
            "gap-2",
            inWatchlist &&
              "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300",
          )}
        >
          <Star
            className={cn("h-4 w-4", inWatchlist && "fill-amber-500 stroke-amber-500")}
          />
          {inWatchlist ? "Watching" : "Add to Watchlist"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>
    </div>
  )
}
