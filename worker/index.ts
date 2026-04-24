import { Worker } from "bullmq"

import { logger } from "../lib/logger"
import { redis } from "../lib/redis"
import { supabaseAdmin } from "../lib/supabase-server"
import type {
  Confidence,
  Counterfactual,
  Dimension,
  HistoricalBenchmark,
  NewsPoint,
  Sensitivity,
  Signal,
  StabilityScore,
} from "../lib/types"

type JobPayload = {
  jobId: string
  userId: string
  ticker: string
}

type FinancialData = {
  revenueGrowth: number
  debtToEquity: number
  freeCashFlowToDebt: number
}

type NewsData = {
  sentimentSeries: NewsPoint[]
  signals: { positive: Signal[]; negative: Signal[] }
}

type TrendsData = {
  trendScore: number
}

async function updateJobProgress(
  jobId: string,
  status: "queued" | "processing" | "completed" | "failed",
  step: number,
  message: string,
) {
  await supabaseAdmin
    .from("jobs")
    .update({
      status,
      progress: { step, message },
    })
    .eq("id", jobId)
}

async function resolveCompany(ticker: string): Promise<{ companyName: string; exchange: string }> {
  // TODO: implement in Phase 5
  return { companyName: `${ticker} Corp`, exchange: "NASDAQ" }
}

async function fetchFinancialData(_ticker: string): Promise<FinancialData> {
  // TODO: implement in Phase 5
  return { revenueGrowth: 8.2, debtToEquity: 0.45, freeCashFlowToDebt: 0.62 }
}

async function fetchNewsData(ticker: string, companyName: string): Promise<NewsData> {
  // TODO: implement in Phase 5
  const now = new Date().toISOString()
  return {
    sentimentSeries: [
      { date: now, sentiment: 0.24, count: 5, headline: `${companyName} momentum stable` },
    ],
    signals: {
      positive: [
        { text: `${ticker} posted resilient margin trend`, source: "Placeholder", date: now, impact: 3 },
      ],
      negative: [
        { text: `${ticker} faces short-term demand uncertainty`, source: "Placeholder", date: now, impact: -2 },
      ],
    },
  }
}

async function fetchTrendsData(_ticker: string): Promise<TrendsData> {
  // TODO: implement in Phase 5
  return { trendScore: 58 }
}

function computeDimensions(
  financialData: FinancialData,
  newsData: NewsData,
  trendsData: TrendsData,
): Dimension[] {
  const sentiment = Math.round((newsData.sentimentSeries[0]?.sentiment ?? 0) * 100)
  return [
    {
      name: "Earnings Stability",
      category: "financial",
      score: Math.max(0, Math.min(100, 70 + Math.round(financialData.revenueGrowth))),
      weight: 0.22,
      description: "Placeholder earnings stability score.",
      rawValue: `${financialData.revenueGrowth.toFixed(1)}% growth`,
      trend: "stable",
    },
    {
      name: "Debt Health",
      category: "financial",
      score: Math.max(0, Math.min(100, 100 - Math.round(financialData.debtToEquity * 100))),
      weight: 0.18,
      description: "Placeholder debt health score.",
      rawValue: financialData.debtToEquity.toFixed(2),
      trend: "strong",
    },
    {
      name: "Cash Flow Resilience",
      category: "financial",
      score: Math.round(financialData.freeCashFlowToDebt * 100),
      weight: 0.18,
      description: "Placeholder cash flow resilience score.",
      rawValue: financialData.freeCashFlowToDebt.toFixed(2),
      trend: "positive",
    },
    {
      name: "Sentiment Momentum",
      category: "sentiment",
      score: Math.max(0, Math.min(100, 50 + sentiment)),
      weight: 0.17,
      description: "Placeholder sentiment momentum score.",
      rawValue: sentiment.toString(),
      trend: "stable",
    },
    {
      name: "Controversy Exposure",
      category: "sentiment",
      score: 62,
      weight: 0.15,
      description: "Placeholder controversy exposure score.",
      rawValue: "low",
      trend: "watchlist",
    },
    {
      name: "Public Interest Trend",
      category: "sentiment",
      score: trendsData.trendScore,
      weight: 0.1,
      description: "Placeholder public interest trend score.",
      rawValue: trendsData.trendScore.toString(),
      trend: "stable",
    },
  ]
}

function computeCompositeScore(dimensions: Dimension[]): number {
  const weighted = dimensions.reduce((sum, d) => sum + d.score * d.weight, 0)
  return Math.round(weighted)
}

function assignSegment(dimensions: Dimension[]): string {
  const financial = dimensions
    .filter((d) => d.category === "financial")
    .reduce((sum, d) => sum + d.score, 0) / 3
  const sentiment = dimensions
    .filter((d) => d.category === "sentiment")
    .reduce((sum, d) => sum + d.score, 0) / 3

  if (financial >= 60 && sentiment >= 60) return "Fundamentally Strong, Reputationally Clean"
  if (financial >= 60 && sentiment < 60) return "Financially Strong, Reputation Declining"
  if (financial < 60 && sentiment >= 60) return "Financially Weak, Sentiment Propped"
  return "Distressed"
}

async function generateAnalysis(
  ticker: string,
  score: number,
  dimensions: Dimension[],
  signals: { positive: Signal[]; negative: Signal[] },
): Promise<{
  summary: string
  counterfactual: Counterfactual
  sensitivity: Sensitivity
  historicalBenchmark: HistoricalBenchmark
  confidence: Confidence
}> {
  // TODO: implement in Phase 5 (OpenAI calls)
  const strongest = [...dimensions].sort((a, b) => b.score - a.score)[0]?.name || "Signal"
  return {
    summary: `${ticker} placeholder analysis generated. Composite score currently ${score}.`,
    counterfactual: {
      condition: `If ${strongest} weakens by 20%`,
      currentScore: score,
      projectedScore: Math.max(0, score - 8),
      currentSegment: assignSegment(dimensions),
      projectedSegment: score - 8 >= 60 ? "Financially Strong, Reputation Declining" : "Distressed",
    },
    sensitivity: {
      maxImpactSignal: signals.negative[0]?.text || "No dominant signal",
      scoreWithout: Math.max(0, score - 4),
      delta: -4,
      singleSignalMaxPercent: 5,
    },
    historicalBenchmark: {
      comparison: "Above sector median in this placeholder run.",
      historicalScore: Math.max(0, score - 6),
      period: "12 months",
    },
    confidence: {
      level: "medium",
      description: "Placeholder confidence while API integrations are stubbed.",
      sourceCount: 3,
    },
  }
}

function buildStabilityScore(input: {
  ticker: string
  companyName: string
  exchange: string
  score: number
  segment: string
  dimensions: Dimension[]
  signals: { positive: Signal[]; negative: Signal[] }
  newsTimeline: NewsPoint[]
  summary: string
  counterfactual: Counterfactual
  sensitivity: Sensitivity
  historicalBenchmark: HistoricalBenchmark
  confidence: Confidence
  processingTimeMs: number
}): StabilityScore {
  return {
    ticker: input.ticker,
    companyName: input.companyName,
    exchange: input.exchange,
    score: input.score,
    segment: input.segment,
    summary: input.summary,
    counterfactual: input.counterfactual,
    analyzedAt: new Date().toISOString(),
    processingTime: input.processingTimeMs,
    cacheHit: false,
    dimensions: input.dimensions,
    signals: input.signals,
    newsTimeline: input.newsTimeline,
    confidence: input.confidence,
    sensitivity: input.sensitivity,
    historicalBenchmark: input.historicalBenchmark,
  }
}

const worker = new Worker(
  "scoring",
  async (job) => {
    const startedAt = Date.now()
    const { jobId, userId, ticker } = job.data as JobPayload

    await updateJobProgress(
      jobId,
      "processing",
      1,
      "Fetching financial data from Alpha Vantage...",
    )
    const { companyName, exchange } = await resolveCompany(ticker)
    const financialData = await fetchFinancialData(ticker)

    await updateJobProgress(
      jobId,
      "processing",
      2,
      "Fetching relevant news signals...",
    )
    const newsData = await fetchNewsData(ticker, companyName)

    await updateJobProgress(
      jobId,
      "processing",
      3,
      "Fetching Google Trends momentum...",
    )
    const trendsData = await fetchTrendsData(ticker)

    await updateJobProgress(
      jobId,
      "processing",
      4,
      "Computing dimensions and composite score...",
    )
    const dimensions = computeDimensions(financialData, newsData, trendsData)
    const score = computeCompositeScore(dimensions)
    const segment = assignSegment(dimensions)
    const analysis = await generateAnalysis(
      ticker,
      score,
      dimensions,
      newsData.signals,
    )

    await updateJobProgress(jobId, "processing", 5, "Saving final score output...")
    const processingTimeMs = Date.now() - startedAt
    const fullScore = buildStabilityScore({
      ticker,
      companyName,
      exchange,
      score,
      segment,
      dimensions,
      signals: newsData.signals,
      newsTimeline: newsData.sentimentSeries,
      summary: analysis.summary,
      counterfactual: analysis.counterfactual,
      sensitivity: analysis.sensitivity,
      historicalBenchmark: analysis.historicalBenchmark,
      confidence: analysis.confidence,
      processingTimeMs,
    })

    const { data: scoreRow, error: insertError } = await supabaseAdmin
      .from("scores")
      .insert({
        user_id: userId,
        ticker: fullScore.ticker,
        company_name: fullScore.companyName,
        exchange: fullScore.exchange,
        score: fullScore.score,
        segment: fullScore.segment,
        summary: fullScore.summary,
        counterfactual: fullScore.counterfactual,
        dimensions: fullScore.dimensions,
        signals: fullScore.signals,
        news_timeline: fullScore.newsTimeline,
        confidence: fullScore.confidence,
        sensitivity: fullScore.sensitivity,
        historical_benchmark: fullScore.historicalBenchmark,
        processing_time_ms: fullScore.processingTime,
        cache_hit: false,
      })
      .select("id")
      .single()

    if (insertError) throw insertError

    const { data: preferenceRow } = await supabaseAdmin
      .from("user_preferences")
      .select("cache_ttl_minutes")
      .eq("user_id", userId)
      .maybeSingle()

    const ttlSeconds = Math.max(
      60,
      (preferenceRow?.cache_ttl_minutes ?? 15) * 60,
    )
    await redis.set(
      `score:${userId}:${ticker}`,
      JSON.stringify(fullScore),
      "EX",
      ttlSeconds,
    )

    await supabaseAdmin
      .from("jobs")
      .update({
        status: "completed",
        progress: { step: 6, message: "Completed" },
        result_id: scoreRow.id,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId)

    logger.info({
      action: "job_complete",
      jobId,
      ticker,
      resultId: scoreRow.id,
      durationMs: processingTimeMs,
    })
  },
  { connection: redis, concurrency: 3 },
)

worker.on("failed", async (job, error) => {
  const payload = (job?.data ?? {}) as Partial<JobPayload>
  if (payload.jobId) {
    await supabaseAdmin
      .from("jobs")
      .update({
        status: "failed",
        error: error.message,
        progress: { step: -1, message: "Failed" },
        completed_at: new Date().toISOString(),
      })
      .eq("id", payload.jobId)
  }

  logger.error({
    action: "job_fail",
    jobId: payload.jobId,
    ticker: payload.ticker,
    error: error.message,
  })
})

logger.info({ action: "worker_ready", queue: "scoring", concurrency: 3 })
