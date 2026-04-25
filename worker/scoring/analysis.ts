import { createHash } from "node:crypto"

import OpenAI from "openai"
import type Redis from "ioredis"
import type { SupabaseClient } from "@supabase/supabase-js"

import { getCached, setCache } from "../../lib/cache"
import { logger } from "../../lib/logger"
import { logApiCallEnd, resolveOpenAIKey } from "../apis/common"
import { computeCompositeScore, MAX_PER_SIGNAL_IMPACT } from "./composite"
import {
  computeAllDimensions,
  type ComputeAllDimensionsInput,
} from "./dimensions"
import type {
  Counterfactual,
  Dimension,
  HistoricalBenchmark,
  Sensitivity,
  Signal,
} from "../../lib/types"
import type { CompanyNewsArticle } from "../apis/newsapi"
import type { SentimentArticleScored } from "./dimensions"

const PROVIDER = "openai" as const
const MODEL = "gpt-4o-mini"
const ANALYSIS_TTL_SEC = 60 * 60 * 24 * 7

type OpenAIClient = OpenAI
type AnalysisCacheNamespace = "summary" | "counterfactual" | "historical"

export type AnalysisContext = {
  ticker: string
  companyName: string
  score: number
  segment: string
  dimensions: Dimension[]
  signals: { positive: Signal[]; negative: Signal[] }
}

function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12)
}

function analysisCacheKey(
  namespace: AnalysisCacheNamespace,
  ctx: AnalysisContext,
  extra: string = "",
): string {
  const topNeg = ctx.signals.negative[0]?.text ?? ""
  const topPos = ctx.signals.positive[0]?.text ?? ""
  const fingerprint = shortHash(`${ctx.score}|${ctx.segment}|${topNeg}|${topPos}|${extra}`)
  return `analysis:${namespace}:${ctx.ticker}:${fingerprint}`
}

function describeDimensions(dimensions: Dimension[]): string {
  return dimensions
    .map((d) => `- ${d.name} (${d.category}, weight ${d.weight}): score ${d.score}, ${d.rawValue}`)
    .join("\n")
}

function describeSignals(signals: { positive: Signal[]; negative: Signal[] }): string {
  const lines: string[] = []
  if (signals.positive.length > 0) {
    lines.push("Positive signals:")
    for (const s of signals.positive.slice(0, 3)) {
      lines.push(`  + (${s.source}) ${s.text}`)
    }
  }
  if (signals.negative.length > 0) {
    lines.push("Negative signals:")
    for (const s of signals.negative.slice(0, 3)) {
      lines.push(`  - (${s.source}) ${s.text}`)
    }
  }
  return lines.join("\n") || "No major signals."
}

async function callOpenAIText(
  client: OpenAIClient,
  redis: Redis,
  ticker: string,
  systemPrompt: string,
  userPrompt: string,
  options: { jsonMode: boolean; maxTokens: number },
): Promise<string | null> {
  const started = Date.now()
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: options.maxTokens,
      ...(options.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    })
    const raw = response.choices[0]?.message?.content?.trim() ?? ""
    await logApiCallEnd(redis, PROVIDER, ticker, started, raw.length > 0)
    return raw || null
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await logApiCallEnd(redis, PROVIDER, ticker, started, false)
    logger.error({ action: "error", provider: PROVIDER, ticker, message })
    return null
  }
}

function tryParseJson<T>(raw: string | null): T | null {
  if (!raw) return null
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const candidates = [raw, fenced ?? "", raw.match(/\{[\s\S]*\}/)?.[0] ?? ""]
  for (const candidate of candidates) {
    if (!candidate.trim()) continue
    try {
      return JSON.parse(candidate) as T
    } catch {
      // try next candidate
    }
  }
  return null
}

/**
 * Bounded sub-task: ask OpenAI for a 3-4 sentence stability narrative.
 * Falls back to a deterministic template when the model is unavailable.
 */
export async function generateSummary(
  ctx: AnalysisContext,
  client: OpenAIClient | null,
  redis: Redis,
): Promise<string> {
  const cacheKey = analysisCacheKey("summary", ctx)
  const cached = await getCached<{ text?: string }>(cacheKey)
  if (cached?.text) {
    return cached.text
  }

  if (client) {
    const systemPrompt =
      "You are a financial analyst. Write a concise stability summary. " +
      "Do not mention the numeric score directly. Focus on WHY the company is stable or unstable. " +
      "Return only the summary text, no JSON. 3-4 sentences."

    const userPrompt = [
      `Company: ${ctx.companyName} (${ctx.ticker})`,
      `Segment classification: ${ctx.segment}`,
      "",
      "Dimensions:",
      describeDimensions(ctx.dimensions),
      "",
      describeSignals(ctx.signals),
    ].join("\n")

    const raw = await callOpenAIText(client, redis, ctx.ticker, systemPrompt, userPrompt, {
      jsonMode: false,
      maxTokens: 240,
    })
    if (raw) {
      await setCache(cacheKey, { text: raw }, ANALYSIS_TTL_SEC)
      logger.info({ action: "analysis_generated", kind: "summary", ticker: ctx.ticker })
      return raw
    }
  }

  const strongest = [...ctx.dimensions].sort((a, b) => b.score - a.score)[0]
  const weakest = [...ctx.dimensions].sort((a, b) => a.score - b.score)[0]
  const fallback =
    `${ctx.companyName} sits in the "${ctx.segment}" segment. ` +
    `Strength is anchored by ${strongest?.name ?? "core fundamentals"}, ` +
    `while ${weakest?.name ?? "ongoing risks"} remains the primary concern.`
  logger.warn({ action: "analysis_fallback", kind: "summary", ticker: ctx.ticker })
  return fallback
}

type CounterfactualPayload = {
  condition?: unknown
  projectedScore?: unknown
  currentSegment?: unknown
  projectedSegment?: unknown
}

/**
 * Bounded sub-task: ask OpenAI to imagine one realistic stress scenario tied
 * to the most material negative signal. Returns a {@link Counterfactual}.
 */
export async function generateCounterfactual(
  ctx: AnalysisContext,
  client: OpenAIClient | null,
  redis: Redis,
): Promise<Counterfactual> {
  const cacheKey = analysisCacheKey("counterfactual", ctx)
  const cached = await getCached<Counterfactual>(cacheKey)
  if (cached) {
    return cached
  }

  const topNegative = ctx.signals.negative[0]
  const topNegativeText = topNegative?.text ?? "the top weakest dimension"

  if (client) {
    const systemPrompt =
      "Generate one counterfactual scenario for this company. " +
      `Given the current score and top negative signal, write a condition starting with "If" and estimate ` +
      "what the score would change to. Return ONLY a JSON object with these keys: " +
      `{ "condition": string, "projectedScore": number (0-100), "currentSegment": string, "projectedSegment": string }.`

    const userPrompt = [
      `Company: ${ctx.companyName} (${ctx.ticker})`,
      `Current score: ${ctx.score}`,
      `Current segment: ${ctx.segment}`,
      `Top negative signal: ${topNegativeText}`,
      "",
      "Dimensions:",
      describeDimensions(ctx.dimensions),
    ].join("\n")

    const raw = await callOpenAIText(client, redis, ctx.ticker, systemPrompt, userPrompt, {
      jsonMode: true,
      maxTokens: 220,
    })
    const parsed = tryParseJson<CounterfactualPayload>(raw)
    if (parsed) {
      const projected = Number(parsed.projectedScore)
      const cf: Counterfactual = {
        condition:
          typeof parsed.condition === "string" && parsed.condition.trim()
            ? parsed.condition.trim()
            : `If ${topNegativeText} worsens materially`,
        currentScore: ctx.score,
        projectedScore: Number.isFinite(projected)
          ? Math.max(0, Math.min(100, Math.round(projected)))
          : Math.max(0, ctx.score - 8),
        currentSegment:
          typeof parsed.currentSegment === "string" && parsed.currentSegment.trim()
            ? parsed.currentSegment.trim()
            : ctx.segment,
        projectedSegment:
          typeof parsed.projectedSegment === "string" && parsed.projectedSegment.trim()
            ? parsed.projectedSegment.trim()
            : ctx.score - 8 >= 60
              ? "Financially Strong, Reputation Declining"
              : "Distressed",
      }
      await setCache(cacheKey, cf, ANALYSIS_TTL_SEC)
      logger.info({ action: "analysis_generated", kind: "counterfactual", ticker: ctx.ticker })
      return cf
    }
  }

  const projectedScore = Math.max(0, ctx.score - 8)
  const fallback: Counterfactual = {
    condition: `If ${topNegativeText} escalates over the next quarter`,
    currentScore: ctx.score,
    projectedScore,
    currentSegment: ctx.segment,
    projectedSegment:
      projectedScore >= 60 ? "Financially Strong, Reputation Declining" : "Distressed",
  }
  logger.warn({ action: "analysis_fallback", kind: "counterfactual", ticker: ctx.ticker })
  return fallback
}

type HistoricalPayload = {
  comparison?: unknown
  historicalScore?: unknown
  period?: unknown
}

/**
 * Bounded sub-task: ask OpenAI to compare the company's current stability
 * profile to a known historical case (e.g. "GE 2018", "Boeing 2019").
 */
export async function generateHistoricalBenchmark(
  ctx: AnalysisContext,
  client: OpenAIClient | null,
  redis: Redis,
): Promise<HistoricalBenchmark> {
  const cacheKey = analysisCacheKey("historical", ctx)
  const cached = await getCached<HistoricalBenchmark>(cacheKey)
  if (cached) {
    return cached
  }

  if (client) {
    const systemPrompt =
      "You compare a company's current stability profile to a real, well-known historical case " +
      "(e.g. \"Apple post-2018 services pivot\", \"Boeing 737 MAX 2019\", \"Wells Fargo 2017 fake accounts\"). " +
      "Return ONLY a JSON object: " +
      `{ "comparison": string (1-2 sentences naming the historical case and how the present case is similar), ` +
      `"historicalScore": number (0-100, your estimate of the historical case's stability), ` +
      `"period": string (e.g. "12 months", "Q3 2018-Q1 2019") }.`

    const userPrompt = [
      `Company: ${ctx.companyName} (${ctx.ticker})`,
      `Current score: ${ctx.score}`,
      `Segment: ${ctx.segment}`,
      "",
      "Dimensions:",
      describeDimensions(ctx.dimensions),
      "",
      describeSignals(ctx.signals),
    ].join("\n")

    const raw = await callOpenAIText(client, redis, ctx.ticker, systemPrompt, userPrompt, {
      jsonMode: true,
      maxTokens: 240,
    })
    const parsed = tryParseJson<HistoricalPayload>(raw)
    if (parsed) {
      const histScore = Number(parsed.historicalScore)
      const benchmark: HistoricalBenchmark = {
        comparison:
          typeof parsed.comparison === "string" && parsed.comparison.trim()
            ? parsed.comparison.trim()
            : "Heuristic benchmark vs internal stability baseline.",
        historicalScore: Number.isFinite(histScore)
          ? Math.max(0, Math.min(100, Math.round(histScore)))
          : Math.max(0, ctx.score - 6),
        period:
          typeof parsed.period === "string" && parsed.period.trim()
            ? parsed.period.trim()
            : "12 months",
      }
      await setCache(cacheKey, benchmark, ANALYSIS_TTL_SEC)
      logger.info({ action: "analysis_generated", kind: "historical", ticker: ctx.ticker })
      return benchmark
    }
  }

  const fallback: HistoricalBenchmark = {
    comparison: "Heuristic benchmark vs internal stability baseline.",
    historicalScore: Math.max(0, ctx.score - 6),
    period: "12 months",
  }
  logger.warn({ action: "analysis_fallback", kind: "historical", ticker: ctx.ticker })
  return fallback
}

export type SensitivityInput = {
  score: number
  signals: { positive: Signal[]; negative: Signal[] }
  controversyArticles: CompanyNewsArticle[]
  sentimentArticles: SentimentArticleScored[]
  dimensionInputs: Omit<
    ComputeAllDimensionsInput,
    "sentimentArticles" | "controversyArticles"
  >
}

/**
 * Compute sensitivity by removing the single highest-impact signal and
 * re-running the dimension + composite score pipeline. This is a deterministic
 * mathematical operation, NOT an LLM task.
 */
export function computeSensitivity(input: SensitivityInput): Sensitivity {
  const allSignals = [...input.signals.positive, ...input.signals.negative]
  if (allSignals.length === 0) {
    return {
      maxImpactSignal: "No dominant signal",
      scoreWithout: input.score,
      delta: 0,
      singleSignalMaxPercent: MAX_PER_SIGNAL_IMPACT,
    }
  }

  const top = allSignals.reduce((best, s) =>
    Math.abs(s.impact) > Math.abs(best.impact) ? s : best,
  )

  const matches = (article: CompanyNewsArticle): boolean => {
    if (top.url && article.url && article.url === top.url) return true
    return article.title.slice(0, 200) === top.text
  }

  const filteredControversy = input.controversyArticles.filter((a) => !matches(a))
  const survivingIndexes: number[] = []
  input.controversyArticles.forEach((article, idx) => {
    if (!matches(article)) survivingIndexes.push(idx)
  })
  const filteredSentiment = survivingIndexes
    .map((idx) => input.sentimentArticles[idx])
    .filter((a): a is SentimentArticleScored => a !== undefined)

  const { dimensions: dimsWithout } = computeAllDimensions({
    ...input.dimensionInputs,
    sentimentArticles: filteredSentiment,
    controversyArticles: filteredControversy,
  })

  const scoreWithout = computeCompositeScore(dimsWithout)
  const delta = scoreWithout - input.score

  logger.info({
    action: "sensitivity_computed",
    removedSignal: top.text,
    impact: top.impact,
    scoreWithout,
    delta,
  })

  return {
    maxImpactSignal: top.text,
    scoreWithout,
    delta,
    singleSignalMaxPercent: MAX_PER_SIGNAL_IMPACT,
  }
}

export async function buildOpenAIClient(
  supabase: SupabaseClient,
  userId: string,
): Promise<OpenAIClient | null> {
  const apiKey = await resolveOpenAIKey(supabase, userId)
  if (!apiKey) return null
  return new OpenAI({ apiKey })
}
