import { createHash } from "node:crypto"

import OpenAI from "openai"
import type Redis from "ioredis"
import type { SupabaseClient } from "@supabase/supabase-js"

import { setCache } from "../../lib/cache"
import { logger } from "../../lib/logger"
import { logApiCallEnd, resolveOpenAIKey } from "../apis/common"

export type SentimentArticle = {
  title: string
  description: string
  /** Used as cache key (hashed). Falls back to title if missing. */
  url?: string
}

const PROVIDER = "openai" as const
const SENTIMENT_TTL_SEC = 60 * 60 * 24 * 7
const BATCH_SIZE = 10
const MODEL = "gpt-4o-mini"

const POSITIVE_WORDS = [
  "growth",
  "beat",
  "profit",
  "strong",
  "upgrade",
  "surge",
  "win",
  "record",
  "expands",
  "positive",
  "outperform",
  "raises guidance",
  "soars",
  "rally",
  "gains",
]

const NEGATIVE_WORDS = [
  "loss",
  "miss",
  "lawsuit",
  "fraud",
  "sec investigation",
  "probe",
  "layoff",
  "decline",
  "cuts",
  "warning",
  "investigation",
  "bankruptcy",
  "downgrade",
  "resign",
  "settlement",
  "fine",
  "scandal",
]

function articleCacheKey(article: SentimentArticle): string {
  const ident = article.url?.trim() || article.title.trim()
  const hash = createHash("sha1").update(ident).digest("hex").slice(0, 16)
  return `sentiment:${hash}`
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}

function lexicalSentiment(article: SentimentArticle): number {
  const text = `${article.title} ${article.description}`.toLowerCase()
  const pos = POSITIVE_WORDS.filter((w) => text.includes(w)).length
  const neg = NEGATIVE_WORDS.filter((w) => text.includes(w)).length
  if (pos + neg === 0) return 0
  return clamp((pos - neg) / (pos + neg + 2), -1, 1)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function parseBatchResponse(raw: string, expectedLength: number): number[] | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const candidates: string[] = [trimmed]
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch?.[1]) candidates.unshift(fenceMatch[1].trim())
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/)
  if (arrayMatch) candidates.unshift(arrayMatch[0])

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (Array.isArray(parsed) && parsed.length === expectedLength) {
        const nums = parsed.map((value) =>
          isFiniteNumber(value) ? clamp(value, -1, 1) : null,
        )
        if (nums.every((value): value is number => value !== null)) {
          return nums
        }
      }
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        "scores" in parsed &&
        Array.isArray((parsed as { scores: unknown[] }).scores) &&
        (parsed as { scores: unknown[] }).scores.length === expectedLength
      ) {
        const nums = (parsed as { scores: unknown[] }).scores.map((value) =>
          isFiniteNumber(value) ? clamp(value, -1, 1) : null,
        )
        if (nums.every((value): value is number => value !== null)) {
          return nums
        }
      }
    } catch {
      // try the next candidate
    }
  }
  return null
}

async function callOpenAIBatch(
  client: OpenAI,
  redis: Redis,
  ticker: string,
  articles: SentimentArticle[],
): Promise<number[] | null> {
  const headlines = articles
    .map((a, i) => {
      const headline = a.title.trim().slice(0, 220).replace(/\s+/g, " ")
      const desc = (a.description ?? "").trim().slice(0, 200).replace(/\s+/g, " ")
      return `${i + 1}. ${headline}${desc ? ` — ${desc}` : ""}`
    })
    .join("\n")

  const prompt = [
    "Rate the sentiment of each headline on a scale from -1.0 (very negative) to +1.0 (very positive).",
    "Respond with only a JSON array of numbers in the same order as the input.",
    `Return exactly ${articles.length} numbers, one per headline.`,
    "",
    headlines,
  ].join("\n")

  const started = Date.now()
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a sentiment scorer. Output strictly a JSON array of numbers in [-1.0, 1.0]. No prose, no keys, no extra text.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
      max_tokens: 256,
    })

    const raw = response.choices[0]?.message?.content ?? ""
    const parsed = parseBatchResponse(raw, articles.length)
    await logApiCallEnd(redis, PROVIDER, ticker, started, parsed !== null)
    if (!parsed) {
      logger.warn({
        action: "sentiment_parse_failed",
        provider: PROVIDER,
        ticker,
        rawPreview: raw.slice(0, 240),
      })
    }
    return parsed
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await logApiCallEnd(redis, PROVIDER, ticker, started, false)
    logger.error({ action: "error", provider: PROVIDER, ticker, message })
    return null
  }
}

export type ScoreSentimentOptions = {
  redis: Redis
  supabase: SupabaseClient
  userId: string
  /** Used purely for logging/metrics correlation. */
  ticker: string
}

/**
 * Bounded sub-task: ask OpenAI to rate each article's headline sentiment in
 * [-1, +1]. Articles are batched in groups of 10 and individual scores are
 * cached in Redis under `sentiment:{hash}` to avoid re-paying for re-runs.
 *
 * Falls back to a deterministic lexical score when the OpenAI key is missing
 * or the call fails — keeps the pipeline live even when the LLM is down.
 */
export async function scoreSentimentBatch(
  articles: SentimentArticle[],
  options: ScoreSentimentOptions,
): Promise<number[]> {
  if (articles.length === 0) return []
  const { redis, supabase, userId, ticker } = options

  const cacheKeys = articles.map(articleCacheKey)
  const cached = (await redis.mget(cacheKeys)).map((raw) => {
    if (!raw) return null
    const num = Number(raw)
    return Number.isFinite(num) ? clamp(num, -1, 1) : null
  })

  const missingIndexes: number[] = []
  cached.forEach((value, idx) => {
    if (value === null) missingIndexes.push(idx)
  })

  const hits = articles.length - missingIndexes.length
  const misses = missingIndexes.length
  logger.info({
    action: "cache_check",
    key: `sentiment:batch:${ticker}`,
    hit: misses === 0,
    hits,
    misses,
  })
  if (hits > 0)
    await redis.incrby("metrics:cache_hits", hits).catch(() => undefined)
  if (misses > 0)
    await redis.incrby("metrics:cache_misses", misses).catch(() => undefined)

  if (missingIndexes.length === 0) {
    logger.info({
      action: "sentiment_batch",
      ticker,
      count: articles.length,
      cacheHits: articles.length,
      cacheMisses: 0,
    })
    return cached.map((value) => value ?? 0)
  }

  const apiKey = await resolveOpenAIKey(supabase, userId)
  const client = apiKey ? new OpenAI({ apiKey }) : null

  const results: number[] = articles.map((_, idx) => cached[idx] ?? 0)

  if (!client) {
    logger.info({
      action: "sentiment_fallback",
      ticker,
      reason: "no_openai_key",
      missing: missingIndexes.length,
    })
    for (const idx of missingIndexes) {
      const score = lexicalSentiment(articles[idx])
      results[idx] = score
      await setCache(cacheKeys[idx], score, SENTIMENT_TTL_SEC)
    }
    return results
  }

  for (let start = 0; start < missingIndexes.length; start += BATCH_SIZE) {
    const slice = missingIndexes.slice(start, start + BATCH_SIZE)
    const batchArticles = slice.map((idx) => articles[idx])
    const batchScores = await callOpenAIBatch(client, redis, ticker, batchArticles)

    if (batchScores) {
      for (let i = 0; i < slice.length; i += 1) {
        const idx = slice[i]
        const score = clamp(batchScores[i], -1, 1)
        results[idx] = score
        await setCache(cacheKeys[idx], score, SENTIMENT_TTL_SEC)
      }
    } else {
      for (const idx of slice) {
        const score = lexicalSentiment(articles[idx])
        results[idx] = score
        await setCache(cacheKeys[idx], score, SENTIMENT_TTL_SEC)
      }
    }
  }

  logger.info({
    action: "sentiment_batch",
    ticker,
    count: articles.length,
    cacheHits: articles.length - missingIndexes.length,
    cacheMisses: missingIndexes.length,
  })

  return results
}

/** Convenience wrapper for a single article. Prefer the batch variant in worker code. */
export async function scoreSentiment(
  article: SentimentArticle,
  options: ScoreSentimentOptions,
): Promise<number> {
  const [score] = await scoreSentimentBatch([article], options)
  return score
}

/** Exposed for places (tests, fallbacks) that need the deterministic baseline. */
export { lexicalSentiment }
