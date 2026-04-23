"use client"

import { Search } from "lucide-react"
import { useAuth } from "@/components/providers/auth-provider"
import { TickerSearch } from "@/components/shared/ticker-search"
import { EmptyState } from "@/components/shared/empty-state"
import { QuickAccessPills } from "@/components/dashboard/quick-access-pills"
import { RecentScoreCard } from "@/components/dashboard/recent-score-card"
import { MarketOverview } from "@/components/dashboard/market-overview"
import { MOCK_RECENT_SCORES } from "@/data/mock-scores"

function greeting(name: string): string {
  const h = new Date().getHours()
  const part =
    h < 5
      ? "Good night"
      : h < 12
        ? "Good morning"
        : h < 18
          ? "Good afternoon"
          : "Good evening"
  const first = name.split(" ")[0]
  return `${part}, ${first}`
}

export default function DashboardPage() {
  const { user } = useAuth()
  const recent = MOCK_RECENT_SCORES
  const hasRecent = recent.length > 0

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:py-10 md:px-6">
      {/* Greeting */}
      <section className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {user ? greeting(user.name) : "Welcome"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground md:text-base">
          Enter a ticker to get a stability analysis.
        </p>
      </section>

      {/* Hero search */}
      <section className="mx-auto mt-8 w-full max-w-2xl">
        <TickerSearch size="large" autoFocus />
        <div className="mt-4">
          <QuickAccessPills />
        </div>
      </section>

      {/* Market overview */}
      <div className="mt-10">
        <MarketOverview />
      </div>

      {/* Recent analyses */}
      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Recent Analyses
          </h2>
          <span className="text-xs text-muted-foreground">
            Last {recent.length}
          </span>
        </div>

        {hasRecent ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((r) => (
              <RecentScoreCard key={`${r.ticker}-${r.timestamp}`} score={r} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Search}
            title="No analyses yet"
            description="Enter a ticker above to get your first stability score."
            action={<QuickAccessPills />}
          />
        )}
      </section>
    </div>
  )
}
