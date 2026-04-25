import { Worker } from "bullmq"

import type { CompanyNewsArticle } from "./apis/newsapi"
import { getCompanyNews } from "./apis/newsapi"
import {
  computeTrendDirection,
  getGoogleTrends,
  type TrendDataPoint,
} from "./apis/serpapi"
import {
  getBalanceSheet,
  getCashFlow,
  getIncomeStatement,
  searchSymbol,
} from "./apis/tiingo"
import {
  buildOpenAIClient,
  computeSensitivity,
  generateCounterfactual,
  generateHistoricalBenchmark,
  generateSummary,
  type AnalysisContext,
} from "./scoring/analysis"
import {
  applyRobustnessCaps,
  assignSegment,
  capSignalImpact,
  computeCompositeScore,
  MAX_PER_SIGNAL_IMPACT,
} from "./scoring/composite"
import {
  computeAllDimensions,
  type SentimentArticleScored,
} from "./scoring/dimensions"
import { scoreSentimentBatch } from "./scoring/sentiment"
import { logger } from "../lib/logger"
import { redis } from "../lib/redis"
import {
  SCORE_PIPELINE_VERSION,
  stabilityScoreCacheKey,
} from "../lib/score-cache-key"
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
  epsValues: number[]
  totalDebt: number | null
  totalEquity: number | null
  freeCashFlow: number | null
  partial: boolean
}

type NewsData = {
  articles: CompanyNewsArticle[]
  scoredArticles: SentimentArticleScored[]
  sentimentSeries: NewsPoint[]
  signals: { positive: Signal[]; negative: Signal[] }
  partial: boolean
}

type TrendsData = {
  series: TrendDataPoint[] | null
  partial: boolean
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
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

async function resolveCompany(
  userId: string,
  ticker: string,
): Promise<{ companyName: string; exchange: string; sector: string; partial: boolean }> {
  const r = await searchSymbol(redis, supabaseAdmin, userId, ticker)
  return {
    companyName: r.companyName,
    exchange: r.exchange,
    sector: r.sector,
    partial: r.partial,
  }
}

async function fetchFinancialData(userId: string, ticker: string): Promise<FinancialData> {
  const income = await getIncomeStatement(redis, supabaseAdmin, userId, ticker)
  const balance = await getBalanceSheet(redis, supabaseAdmin, userId, ticker)
  const cash = await getCashFlow(redis, supabaseAdmin, userId, ticker)

  const epsValues = income.quarterlyEPS
    .map((row) => Number(row.reportedEPS))
    .filter((n) => Number.isFinite(n))

  return {
    epsValues,
    totalDebt: balance.totalDebt,
    totalEquity: balance.totalEquity,
    freeCashFlow: cash.freeCashFlow,
    partial: income.partial || balance.partial || cash.partial,
  }
}

async function fetchTrendsData(userId: string, ticker: string): Promise<TrendsData> {
  const series = await getGoogleTrends(redis, supabaseAdmin, userId, ticker, 90)
  if (!series || series.length === 0) {
    return { series: null, partial: true }
  }
  // Use computeTrendDirection just to log direction; the dimension scorer reads the raw series.
  const dir = computeTrendDirection(series)
  if (dir) {
    logger.info({
      action: "trend_direction",
      ticker,
      direction: dir.direction,
      changePercent: Number(dir.changePercent.toFixed(2)),
    })
  }
  return { series, partial: false }
}

async function buildNewsData(
  userId: string,
  ticker: string,
  articles: CompanyNewsArticle[],
  newsListPartial: boolean,
): Promise<NewsData> {
  if (articles.length === 0) {
    const now = new Date().toISOString()
    return {
      articles: [],
      scoredArticles: [],
      sentimentSeries: [
        { date: now, sentiment: 0, count: 0, headline: "No recent news coverage" },
      ],
      signals: { positive: [], negative: [] },
      partial: true,
    }
  }

  const sentimentScores = await scoreSentimentBatch(
    articles.map((a) => ({ title: a.title, description: a.description, url: a.url })),
    { redis, supabase: supabaseAdmin, userId, ticker },
  )

  const scoredArticles: SentimentArticleScored[] = articles.map((article, idx) => ({
    sentiment: sentimentScores[idx] ?? 0,
    publishedAt: article.publishedAt,
    credibilityWeight: article.credibilityWeight,
  }))

  const now = Date.now()
  const byDay = new Map<
    string,
    { sumWeighted: number; sumWeight: number; count: number; headline: string }
  >()

  articles.forEach((article, idx) => {
    const sentiment = sentimentScores[idx] ?? 0
    const day =
      (article.publishedAt || "").slice(0, 10) ||
      new Date().toISOString().slice(0, 10)
    const ts = new Date(article.publishedAt || now).getTime()
    const daysAgo = Math.max(0, (now - (Number.isFinite(ts) ? ts : now)) / 86_400_000)
    const recency = 1 + 2 * Math.max(0, 1 - daysAgo / 30)
    const w = Math.max(0.1, article.credibilityWeight) * recency
    const prev = byDay.get(day) ?? { sumWeighted: 0, sumWeight: 0, count: 0, headline: article.title }
    prev.sumWeighted += sentiment * w
    prev.sumWeight += w
    prev.count += 1
    if (!prev.headline && article.title) prev.headline = article.title
    byDay.set(day, prev)
  })

  const sentimentSeries: NewsPoint[] = [...byDay.entries()]
    .sort(([da], [db]) => da.localeCompare(db))
    .map(([date, value]) => ({
      date: `${date}T12:00:00.000Z`,
      sentiment:
        value.sumWeight > 0 ? clamp(value.sumWeighted / value.sumWeight, -1, 1) : 0,
      count: value.count,
      headline: value.headline || "Headline",
    }))

  const scoredSignals = articles.map((article, idx) => {
    const sentiment = sentimentScores[idx] ?? 0
    const rawImpact = sentiment * MAX_PER_SIGNAL_IMPACT * Math.max(0.5, article.credibilityWeight)
    const impact = Math.round(clamp(rawImpact, -MAX_PER_SIGNAL_IMPACT, MAX_PER_SIGNAL_IMPACT))
    const url = article.url?.trim() ?? ""
    const base: Signal = {
      text: article.title.slice(0, 200),
      source: article.source,
      date: article.publishedAt,
      impact,
    }
    return capSignalImpact(url ? { ...base, url } : base)
  })

  const positive = scoredSignals
    .filter((s) => s.impact > 0)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5)

  const negative = scoredSignals
    .filter((s) => s.impact < 0)
    .sort((a, b) => a.impact - b.impact)
    .slice(0, 5)

  return {
    articles,
    scoredArticles,
    sentimentSeries,
    signals: applyRobustnessCaps({ positive, negative }),
    partial: newsListPartial,
  }
}

async function generateAnalysis(
  userId: string,
  ctx: AnalysisContext,
  confidenceInput: { level: Confidence["level"]; description: string; sourceCount: number },
): Promise<{
  summary: string
  counterfactual: Counterfactual
  historicalBenchmark: HistoricalBenchmark
  confidence: Confidence
}> {
  const client = await buildOpenAIClient(supabaseAdmin, userId)
  const [summary, counterfactual, historicalBenchmark] = await Promise.all([
    generateSummary(ctx, client, redis),
    generateCounterfactual(ctx, client, redis),
    generateHistoricalBenchmark(ctx, client, redis),
  ])
  return {
    summary,
    counterfactual,
    historicalBenchmark,
    confidence: {
      level: confidenceInput.level,
      description: confidenceInput.description,
      sourceCount: confidenceInput.sourceCount,
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
    pipelineVersion: SCORE_PIPELINE_VERSION,
    dimensions: input.dimensions,
    signals: input.signals,
    newsTimeline: input.newsTimeline,
    confidence: input.confidence,
    sensitivity: input.sensitivity,
    historicalBenchmark: input.historicalBenchmark,
  }
}

function resolveConfidence(
  partial: {
    earnings: boolean
    debt: boolean
    cashFlow: boolean
    sentiment: boolean
    controversy: boolean
    trends: boolean
  },
  companyPartial: boolean,
  newsListPartial: boolean,
): { level: Confidence["level"]; description: string; sourceCount: number } {
  const financialPartial = partial.earnings || partial.debt || partial.cashFlow
  const newsPartial = partial.sentiment || partial.controversy || newsListPartial
  const trendsPartial = partial.trends

  let sources = 0
  if (!financialPartial) sources += 1
  if (!newsPartial) sources += 1
  if (!trendsPartial) sources += 1

  const coreOk = !financialPartial && !newsPartial && !companyPartial
  const level: Confidence["level"] =
    coreOk && sources >= 2 ? "high" : coreOk || sources >= 1 ? "medium" : "low"
  const description =
    level === "high"
      ? "Financial and news inputs complete; trends optional."
      : level === "medium"
        ? "Some external sources returned partial data; review raw signals."
        : "Multiple sources missing or partial; interpret with caution."
  return { level, description, sourceCount: sources }
}

const scoringConcurrency = Math.min(
  3,
  Math.max(1, Number(process.env.SCORING_WORKER_CONCURRENCY ?? 1)),
)

const worker = new Worker(
  "scoring",
  async (job) => {
    const startedAt = Date.now()
    const { jobId, userId, ticker } = job.data as JobPayload

    await updateJobProgress(
      jobId,
      "processing",
      1,
      "Fetching financial data from Tiingo...",
    )
    const company = await resolveCompany(userId, ticker)
    const financialData = await fetchFinancialData(userId, ticker)

    await updateJobProgress(
      jobId,
      "processing",
      2,
      "Fetching relevant news signals...",
    )
    const { articles, partial: newsListPartial } = await getCompanyNews(
      redis,
      supabaseAdmin,
      userId,
      ticker,
      company.companyName,
      30,
    )
    const newsData = await buildNewsData(userId, ticker, articles, newsListPartial)

    await updateJobProgress(
      jobId,
      "processing",
      3,
      "Fetching Google Trends momentum...",
    )
    const trendsData = await fetchTrendsData(userId, ticker)

    await updateJobProgress(
      jobId,
      "processing",
      4,
      "Computing dimensions and composite score...",
    )
    const baseDimensionInputs = {
      earnings: { epsValues: financialData.epsValues, sector: company.sector },
      debt: {
        totalDebt: financialData.totalDebt,
        totalEquity: financialData.totalEquity,
        sector: company.sector,
      },
      cashFlow: {
        freeCashFlow: financialData.freeCashFlow,
        totalDebt: financialData.totalDebt,
      },
      trends: { series: trendsData.series },
    }

    const { dimensions, partial: dimensionPartial } = computeAllDimensions({
      ...baseDimensionInputs,
      sentimentArticles: newsData.scoredArticles,
      controversyArticles: newsData.articles,
    })

    const score = computeCompositeScore(dimensions)
    const segment = assignSegment(dimensions)

    const sensitivity = computeSensitivity({
      score,
      signals: newsData.signals,
      controversyArticles: newsData.articles,
      sentimentArticles: newsData.scoredArticles,
      dimensionInputs: baseDimensionInputs,
    })

    const confidenceMeta = resolveConfidence(
      dimensionPartial,
      company.partial,
      newsListPartial,
    )

    const analysisCtx: AnalysisContext = {
      ticker,
      companyName: company.companyName,
      score,
      segment,
      dimensions,
      signals: newsData.signals,
    }

    const analysis = await generateAnalysis(userId, analysisCtx, confidenceMeta)

    await updateJobProgress(jobId, "processing", 5, "Saving final score output...")
    const processingTimeMs = Date.now() - startedAt
    const fullScore = buildStabilityScore({
      ticker,
      companyName: company.companyName,
      exchange: company.exchange,
      score,
      segment,
      dimensions,
      signals: newsData.signals,
      newsTimeline: newsData.sentimentSeries,
      summary: analysis.summary,
      counterfactual: analysis.counterfactual,
      sensitivity,
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
      stabilityScoreCacheKey(userId, ticker),
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
  { connection: redis, concurrency: scoringConcurrency },
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

logger.info({
  action: "worker_ready",
  queue: "scoring",
  concurrency: scoringConcurrency,
})
