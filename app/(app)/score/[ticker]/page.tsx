"use client"

import { use, useState } from "react"
import { getScoreForTicker } from "@/data/mock-scores"
import { ScoreLoading } from "@/components/score/score-loading"
import { ScoreHeaderBar } from "@/components/score/score-header-bar"
import { ScoreHero } from "@/components/score/score-hero"
import { DimensionBreakdown } from "@/components/score/dimension-breakdown"
import { SignalsSection } from "@/components/score/signals-section"
import { NewsTimeline } from "@/components/score/news-timeline"
import { ProcessingInfo } from "@/components/score/processing-info"

export default function ScorePage({
  params,
}: {
  params: Promise<{ ticker: string }>
}) {
  const { ticker: tickerParam } = use(params)
  const ticker = tickerParam.toUpperCase()
  const data = getScoreForTicker(ticker)

  // If cache hit, skip loading; otherwise simulate processing
  const [loading, setLoading] = useState(!data.cacheHit)
  const [reloadKey, setReloadKey] = useState(0)

  const handleRefresh = () => {
    setLoading(true)
    setReloadKey((k) => k + 1)
  }

  if (loading) {
    return (
      <ScoreLoading
        key={reloadKey}
        ticker={ticker}
        onComplete={() => setLoading(false)}
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      <ScoreHeaderBar data={data} onRefresh={handleRefresh} />
      <ScoreHero data={data} />
      <DimensionBreakdown dimensions={data.dimensions} />
      <SignalsSection
        positive={data.signals.positive}
        negative={data.signals.negative}
      />
      <NewsTimeline timeline={data.newsTimeline} />
      <ProcessingInfo
        processingTime={data.processingTime}
        cacheHit={data.cacheHit ?? false}
      />
    </div>
  )
}
