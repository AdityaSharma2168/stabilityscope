"use client"

import { use, useEffect, useState } from "react"
import { ScoreLoading } from "@/components/score/score-loading"
import { ScoreHeaderBar } from "@/components/score/score-header-bar"
import { ScoreHero } from "@/components/score/score-hero"
import { DimensionBreakdown } from "@/components/score/dimension-breakdown"
import { SignalsSection } from "@/components/score/signals-section"
import { NewsTimeline } from "@/components/score/news-timeline"
import { ValidationSection } from "@/components/score/validation-section"
import { ProcessingInfo } from "@/components/score/processing-info"
import { useScoreDetail } from "@/hooks/use-score-detail"

export default function ScorePage({
  params,
}: {
  params: Promise<{ ticker: string }>
}) {
  const { ticker: tickerParam } = use(params)
  const ticker = tickerParam.toUpperCase()
  const { score, isLoading, refresh } = useScoreDetail(ticker)

  // Show the animated pipeline when data is still loading OR when the
  // resolved score is a fresh analysis (cache miss). On cache hits, skip
  // the pipeline and render the report immediately.
  const [showPipeline, setShowPipeline] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (isLoading) {
      setShowPipeline(true)
    } else if (score?.cacheHit) {
      // Cache hit: skip the animated pipeline
      setShowPipeline(false)
    }
  }, [isLoading, score])

  const handleRefresh = () => {
    setShowPipeline(true)
    setReloadKey((k) => k + 1)
    refresh()
  }

  if (isLoading || !score || showPipeline) {
    return (
      <ScoreLoading
        key={reloadKey}
        ticker={ticker}
        onComplete={() => setShowPipeline(false)}
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      <ScoreHeaderBar data={score} onRefresh={handleRefresh} />
      <ScoreHero data={score} />
      <DimensionBreakdown dimensions={score.dimensions} />
      <SignalsSection
        positive={score.signals.positive}
        negative={score.signals.negative}
      />
      <NewsTimeline timeline={score.newsTimeline} />
      <ValidationSection score={score} />
      <ProcessingInfo
        processingTime={score.processingTime}
        cacheHit={score.cacheHit ?? false}
        sourcesCount={score.confidence?.sourceCount ?? 5}
      />
    </div>
  )
}
