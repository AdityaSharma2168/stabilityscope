import type Redis from "ioredis"
import type { SupabaseClient } from "@supabase/supabase-js"

import { getCached, setCache } from "../../lib/cache"
import { findDow30 } from "../../lib/dow30"
import { logger } from "../../lib/logger"
import {
  TIINGO_MIN_INTERVAL_MS,
  logApiCallEnd,
  resolveTiingoKey,
  sleep,
} from "./common"

const PROVIDER = "tiingo" as const
const CACHE_TTL_SEC = 3600

const cacheKey = (ticker: string) => `tiingo:${ticker.toUpperCase()}`

/** Serialize per user+ticker so concurrent income/balance/cash callers share one fetch. */
const financialInflight = new Map<string, Promise<TiingoFinancialCache>>()

export type SymbolSearchResult = {
  symbol: string
  companyName: string
  exchange: string
  sector: string
}

export type QuarterlyEpsRow = {
  fiscalDateEnding: string
  reportedEPS: string
}

export type IncomeStatementResult = {
  quarterlyEPS: QuarterlyEpsRow[]
  partial: boolean
}

export type BalanceSheetResult = {
  totalDebt: number | null
  totalEquity: number | null
  partial: boolean
}

export type CashFlowResult = {
  freeCashFlow: number | null
  operatingCashFlow: number | null
  partial: boolean
}

export type DailyPriceRow = {
  date: string
  close: number
  adjClose: number
  volume: number
}

export type DailyPricesResult = {
  prices: DailyPriceRow[]
  partial: boolean
}

type TiingoSearchHit = {
  ticker?: string
  name?: string
  permaTicker?: string
  assetType?: string
  countryCode?: string
  isActive?: boolean
}

type TiingoStatementCell = {
  dataCode?: string
  value?: number | null
}

type TiingoStatementGroup = {
  balanceSheet?: TiingoStatementCell[]
  cashFlow?: TiingoStatementCell[]
  incomeStatement?: TiingoStatementCell[]
  overview?: TiingoStatementCell[]
}

type TiingoStatementRow = {
  date?: string
  year?: number
  quarter?: number
  statementData?: TiingoStatementGroup
}

type TiingoDailyPriceRow = {
  date?: string
  close?: number
  adjClose?: number
  volume?: number
}

export type TiingoFinancialCache = {
  search?: TiingoSearchHit[] | null
  statements?: TiingoStatementRow[] | null
  prices?: TiingoDailyPriceRow[] | null
  partial?: boolean
  /** Set if Tiingo returns a hard auth/permission error so the worker stops retrying for the TTL. */
  authBlocked?: boolean
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function valueByCode(
  cells: TiingoStatementCell[] | undefined,
  code: string,
): number | null {
  if (!Array.isArray(cells)) return null
  for (const c of cells) {
    if (c?.dataCode === code) {
      const v = c.value
      if (typeof v === "number" && Number.isFinite(v)) return v
    }
  }
  return null
}

let lastTiingoRequestAt = 0

async function respectTiingoRateLimit(): Promise<void> {
  const now = Date.now()
  const elapsed = now - lastTiingoRequestAt
  if (lastTiingoRequestAt > 0 && elapsed < TIINGO_MIN_INTERVAL_MS) {
    await sleep(TIINGO_MIN_INTERVAL_MS - elapsed)
  }
  lastTiingoRequestAt = Date.now()
}

async function fetchTiingoJson(
  redis: Redis,
  ticker: string,
  url: URL,
  apiKey: string,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string; status?: number }> {
  await respectTiingoRateLimit()
  const started = Date.now()
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
    })
    const text = await res.text()
    let data: unknown
    try {
      data = text ? (JSON.parse(text) as unknown) : null
    } catch {
      await logApiCallEnd(redis, PROVIDER, ticker, started, false)
      return { ok: false, error: "Invalid JSON from Tiingo", status: res.status }
    }

    if (!res.ok) {
      await logApiCallEnd(redis, PROVIDER, ticker, started, false)
      const detail =
        isRecord(data) && typeof data.detail === "string"
          ? data.detail
          : isRecord(data) && typeof data.message === "string"
            ? data.message
            : `HTTP ${res.status}`
      return { ok: false, error: detail, status: res.status }
    }

    await logApiCallEnd(redis, PROVIDER, ticker, started, true)
    return { ok: true, data }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logApiCallEnd(redis, PROVIDER, ticker, started, false)
    return { ok: false, error: msg }
  }
}

function isAuthError(status: number | undefined, message: string): boolean {
  if (status === 401 || status === 403) return true
  const m = message.toLowerCase()
  return m.includes("invalid token") || m.includes("permission")
}

async function loadFinancialCache(
  ticker: string,
): Promise<TiingoFinancialCache | null> {
  const key = cacheKey(ticker)
  const raw = await getCached<unknown>(key)
  if (!raw || !isRecord(raw)) return null
  return raw as TiingoFinancialCache
}

async function saveFinancialCache(
  ticker: string,
  patch: TiingoFinancialCache,
): Promise<void> {
  const key = cacheKey(ticker)
  const existing = (await loadFinancialCache(ticker)) ?? {}
  const merged: TiingoFinancialCache = { ...existing, ...patch }
  await setCache(key, merged, CACHE_TTL_SEC)
}

function isBundleComplete(c: TiingoFinancialCache | null): boolean {
  return Boolean(c?.search && c?.statements)
}

async function loadOrFetchFinancialBundle(
  redis: Redis,
  supabase: SupabaseClient,
  userId: string,
  upper: string,
): Promise<TiingoFinancialCache> {
  const key = cacheKey(upper)
  const cached = await loadFinancialCache(upper)
  if (cached !== null && cached.authBlocked === true) {
    logger.info({
      action: "tiingo_circuit",
      key,
      ticker: upper,
      message: "Tiingo auth previously rejected; skipping until cache TTL expires.",
    })
    return cached
  }
  if (cached !== null && isBundleComplete(cached)) {
    return cached
  }

  const apiKey = await resolveTiingoKey(supabase, userId)
  if (!apiKey) {
    logger.error({ action: "error", provider: PROVIDER, ticker: upper, message: "Missing API key" })
    return { partial: true }
  }

  const state: TiingoFinancialCache = { ...(cached ?? {}) }
  let partial = Boolean(state.partial)
  let authBlocked = false

  const run = async (
    needed: boolean,
    buildUrl: () => URL,
    assign: (data: unknown) => void,
  ): Promise<void> => {
    if (!needed || authBlocked) return
    const res = await fetchTiingoJson(redis, upper, buildUrl(), apiKey)
    if (res.ok) {
      assign(res.data)
    } else {
      if (isAuthError(res.status, res.error)) {
        authBlocked = true
        state.authBlocked = true
      }
      logger.error({
        action: "error",
        provider: PROVIDER,
        ticker: upper,
        message: res.error,
      })
      partial = true
    }
    await saveFinancialCache(upper, state)
  }

  await run(
    !state.search,
    () => {
      const u = new URL("https://api.tiingo.com/tiingo/utilities/search")
      u.searchParams.set("query", upper)
      return u
    },
    (data) => {
      state.search = Array.isArray(data) ? (data as TiingoSearchHit[]) : []
    },
  )

  // Pick best match: exact ticker first, else first hit.
  let resolvedTicker = upper
  if (Array.isArray(state.search) && state.search.length > 0) {
    const exact = state.search.find(
      (h) => typeof h.ticker === "string" && h.ticker.toUpperCase() === upper,
    )
    const chosen = exact ?? state.search[0]
    if (typeof chosen.ticker === "string") {
      resolvedTicker = chosen.ticker.toUpperCase()
    }
  }

  await run(
    !state.statements,
    () => new URL(`https://api.tiingo.com/tiingo/fundamentals/${encodeURIComponent(resolvedTicker)}/statements`),
    (data) => {
      state.statements = Array.isArray(data) ? (data as TiingoStatementRow[]) : []
    },
  )

  // Daily prices are optional context — failure should not block scoring.
  await run(
    !state.prices,
    () => new URL(`https://api.tiingo.com/tiingo/daily/${encodeURIComponent(resolvedTicker)}/prices`),
    (data) => {
      state.prices = Array.isArray(data) ? (data as TiingoDailyPriceRow[]) : []
    },
  )

  state.partial = partial || Boolean(state.authBlocked)
  await saveFinancialCache(upper, state)
  return state
}

export async function ensureFinancialData(
  redis: Redis,
  supabase: SupabaseClient,
  userId: string,
  ticker: string,
): Promise<TiingoFinancialCache> {
  const upper = ticker.toUpperCase()
  const key = cacheKey(upper)
  const quick = await loadFinancialCache(upper)
  if (quick !== null && quick.authBlocked === true) {
    logger.info({
      action: "tiingo_circuit",
      key,
      ticker: upper,
      message: "Auth circuit (from cache); skipping Tiingo.",
    })
    return quick
  }
  if (quick !== null && isBundleComplete(quick)) {
    return quick
  }

  const lockKey = `${userId}:${upper}`
  let pending = financialInflight.get(lockKey)
  if (!pending) {
    pending = loadOrFetchFinancialBundle(redis, supabase, userId, upper).finally(() => {
      financialInflight.delete(lockKey)
    })
    financialInflight.set(lockKey, pending)
  }
  return pending
}

function pickBestSearchHit(
  hits: TiingoSearchHit[] | null | undefined,
  upper: string,
): TiingoSearchHit | null {
  if (!Array.isArray(hits) || hits.length === 0) return null
  const exact = hits.find(
    (h) => typeof h.ticker === "string" && h.ticker.toUpperCase() === upper,
  )
  return exact ?? hits[0] ?? null
}

export async function searchSymbol(
  redis: Redis,
  supabase: SupabaseClient,
  userId: string,
  ticker: string,
): Promise<SymbolSearchResult & { partial: boolean }> {
  const upper = ticker.toUpperCase()
  const bundle = await ensureFinancialData(redis, supabase, userId, ticker)
  const hit = pickBestSearchHit(bundle.search, upper)

  if (hit && hit.name && hit.ticker) {
    return {
      symbol: hit.ticker.toUpperCase(),
      companyName: hit.name,
      exchange: hit.countryCode || hit.assetType || "Unknown",
      sector: "Unknown",
      partial: Boolean(bundle.partial),
    }
  }

  // Fallback: Tiingo's /utilities/search occasionally misses common tickers
  // (or rejects them on free tier). Since input is already constrained to
  // DOW 30, prefer the canonical DOW30 name over an "(unresolved)" placeholder.
  const dow = findDow30(upper)
  if (dow) {
    logger.info({
      action: "symbol_fallback_dow30",
      provider: PROVIDER,
      ticker: upper,
      companyName: dow.name,
    })
    return {
      symbol: upper,
      companyName: dow.name,
      exchange: "Unknown",
      sector: "Unknown",
      partial: Boolean(bundle.partial),
    }
  }

  return {
    symbol: upper,
    companyName: `${upper} (unresolved)`,
    exchange: "Unknown",
    sector: "Unknown",
    partial: true,
  }
}

/** Aggregated raw financials for a ticker (used by getIncome/getBalance/getCash internally). */
export async function getFinancials(
  redis: Redis,
  supabase: SupabaseClient,
  userId: string,
  ticker: string,
): Promise<{
  income: IncomeStatementResult
  balance: BalanceSheetResult
  cash: CashFlowResult
  partial: boolean
}> {
  const bundle = await ensureFinancialData(redis, supabase, userId, ticker)
  return {
    income: extractIncome(bundle),
    balance: extractBalance(bundle),
    cash: extractCash(bundle),
    partial: Boolean(bundle.partial),
  }
}

function quarterlyOnly(rows: TiingoStatementRow[] | null | undefined): TiingoStatementRow[] {
  if (!Array.isArray(rows)) return []
  // quarter 0 = annual report; we want quarterly granularity.
  return rows
    .filter((r) => typeof r.date === "string" && (r.quarter ?? 0) > 0)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
}

function extractIncome(bundle: TiingoFinancialCache): IncomeStatementResult {
  const quarters = quarterlyOnly(bundle.statements)
  if (quarters.length === 0) {
    return { quarterlyEPS: [], partial: true }
  }
  const rows: QuarterlyEpsRow[] = []
  for (const q of quarters) {
    const eps =
      valueByCode(q.statementData?.incomeStatement, "eps") ??
      valueByCode(q.statementData?.incomeStatement, "epsDil")
    if (eps === null || !q.date) continue
    rows.push({ fiscalDateEnding: q.date, reportedEPS: eps.toString() })
    if (rows.length >= 8) break
  }
  return {
    quarterlyEPS: rows,
    partial: Boolean(bundle.partial) || rows.length === 0,
  }
}

function extractBalance(bundle: TiingoFinancialCache): BalanceSheetResult {
  const quarters = quarterlyOnly(bundle.statements)
  if (quarters.length === 0) {
    return { totalDebt: null, totalEquity: null, partial: true }
  }
  const latest = quarters[0].statementData?.balanceSheet
  let totalDebt = valueByCode(latest, "debt")
  if (totalDebt === null) {
    const cur = valueByCode(latest, "debtCurrent")
    const non = valueByCode(latest, "debtNonCurrent")
    if (cur !== null || non !== null) {
      totalDebt = (cur ?? 0) + (non ?? 0)
    } else {
      totalDebt = valueByCode(latest, "totalLiabilities")
    }
  }
  const totalEquity = valueByCode(latest, "equity")
  return {
    totalDebt,
    totalEquity,
    partial: Boolean(bundle.partial) || totalDebt === null || totalEquity === null,
  }
}

function extractCash(bundle: TiingoFinancialCache): CashFlowResult {
  const quarters = quarterlyOnly(bundle.statements)
  if (quarters.length === 0) {
    return { freeCashFlow: null, operatingCashFlow: null, partial: true }
  }
  const latest = quarters[0].statementData?.cashFlow
  const ocf = valueByCode(latest, "ncfo")
  let fcf = valueByCode(latest, "freeCashFlow")
  if (fcf === null) {
    const capex = valueByCode(latest, "capex")
    if (ocf !== null && capex !== null) {
      fcf = ocf - Math.abs(capex)
    }
  }
  return {
    freeCashFlow: fcf,
    operatingCashFlow: ocf,
    partial: Boolean(bundle.partial) || ocf === null,
  }
}

export async function getIncomeStatement(
  redis: Redis,
  supabase: SupabaseClient,
  userId: string,
  ticker: string,
): Promise<IncomeStatementResult> {
  const bundle = await ensureFinancialData(redis, supabase, userId, ticker)
  return extractIncome(bundle)
}

export async function getBalanceSheet(
  redis: Redis,
  supabase: SupabaseClient,
  userId: string,
  ticker: string,
): Promise<BalanceSheetResult> {
  const bundle = await ensureFinancialData(redis, supabase, userId, ticker)
  return extractBalance(bundle)
}

export async function getCashFlow(
  redis: Redis,
  supabase: SupabaseClient,
  userId: string,
  ticker: string,
): Promise<CashFlowResult> {
  const bundle = await ensureFinancialData(redis, supabase, userId, ticker)
  return extractCash(bundle)
}

export async function getDailyPrices(
  redis: Redis,
  supabase: SupabaseClient,
  userId: string,
  ticker: string,
): Promise<DailyPricesResult> {
  const bundle = await ensureFinancialData(redis, supabase, userId, ticker)
  const rows = Array.isArray(bundle.prices) ? bundle.prices : []
  const prices: DailyPriceRow[] = rows
    .filter((r): r is TiingoDailyPriceRow => Boolean(r?.date))
    .map((r) => ({
      date: String(r.date),
      close: typeof r.close === "number" ? r.close : 0,
      adjClose: typeof r.adjClose === "number" ? r.adjClose : 0,
      volume: typeof r.volume === "number" ? r.volume : 0,
    }))
  return {
    prices,
    partial: Boolean(bundle.partial) || prices.length === 0,
  }
}
