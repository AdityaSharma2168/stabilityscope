import { logger } from "../../lib/logger"
import type { Dimension, Signal } from "../../lib/types"
import { computeCompositeScore, MAX_PER_SIGNAL_IMPACT } from "../scoring/composite"

export type SignalSensitivityRow = {
  text: string
  source: string
  impact: number
  /** Composite score with this signal removed. */
  scoreWithout: number
  /** scoreWithout - originalScore. Sign indicates direction of removal effect. */
  delta: number
  /** True iff |delta| > MAX_PER_SIGNAL_IMPACT (i.e. cap was violated). */
  exceedsCap: boolean
}

export type DimensionSensitivityRow = {
  name: string
  category: Dimension["category"]
  weight: number
  score: number
  /** Composite if this dimension is dropped entirely from the weighted sum. */
  scoreWithout: number
  delta: number
}

export type SensitivityReport = {
  originalScore: number
  cap: number
  /** Per-news-signal removal sweep (capped at MAX_PER_SIGNAL_IMPACT). */
  signals: SignalSensitivityRow[]
  /** Per-dimension drop sweep (uncapped — financial dimensions are unbounded). */
  dimensions: DimensionSensitivityRow[]
  /** Signals whose post-removal delta exceeded the per-signal cap. */
  violations: SignalSensitivityRow[]
  /** True when no news-signal removal exceeded the cap. */
  passed: boolean
  /** The most influential signal (largest |delta|). Helpful for narrative. */
  maxImpactSignal: SignalSensitivityRow | null
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}

/**
 * Validation-time sensitivity sweep. Operates on a *persisted* StabilityScore
 * — i.e. just the dimensions and signals that come back from the DB — without
 * needing the raw NewsAPI articles or financial inputs.
 *
 * Two passes:
 *
 * 1. **Per-signal news pass** — removes each signal one at a time and reports
 *    the resulting composite. By construction, `Signal.impact` is the
 *    score-point contribution of that single article (already clipped at
 *    ±MAX_PER_SIGNAL_IMPACT during scoring), so `scoreWithout = score - impact`
 *    and the absolute delta must not exceed the cap. Anything that does is a
 *    robustness violation.
 *
 * 2. **Per-dimension pass** — drops each dimension and recomputes the weighted
 *    composite over the remaining ones (renormalized). Financial dimensions
 *    are intentionally *uncapped* per the spec: a single fundamental
 *    deterioration *should* be allowed to swing the score by more than 5.
 *    This pass is descriptive, not enforced.
 */
export function runSensitivityAnalysis(
  dimensions: Dimension[],
  signals: { positive: Signal[]; negative: Signal[] },
  originalScore?: number,
): SensitivityReport {
  const score =
    typeof originalScore === "number"
      ? originalScore
      : computeCompositeScore(dimensions)

  const allSignals = [...signals.positive, ...signals.negative]

  const signalRows: SignalSensitivityRow[] = allSignals.map((signal) => {
    const scoreWithout = clamp(Math.round(score - signal.impact), 0, 100)
    const delta = scoreWithout - score
    const exceedsCap = Math.abs(delta) > MAX_PER_SIGNAL_IMPACT
    return {
      text: signal.text,
      source: signal.source,
      impact: signal.impact,
      scoreWithout,
      delta,
      exceedsCap,
    }
  })

  const dimensionRows: DimensionSensitivityRow[] = dimensions.map((dim, idx) => {
    const remaining = dimensions.filter((_, i) => i !== idx)
    const scoreWithout = computeCompositeScore(remaining)
    return {
      name: dim.name,
      category: dim.category,
      weight: dim.weight,
      score: dim.score,
      scoreWithout,
      delta: scoreWithout - score,
    }
  })

  const violations = signalRows.filter((row) => row.exceedsCap)
  const maxImpactSignal =
    signalRows.length === 0
      ? null
      : signalRows.reduce((best, row) =>
          Math.abs(row.delta) > Math.abs(best.delta) ? row : best,
        )

  logger.info({
    action: "sensitivity_analysis",
    originalScore: score,
    signalCount: signalRows.length,
    dimensionCount: dimensionRows.length,
    cap: MAX_PER_SIGNAL_IMPACT,
    violations: violations.length,
    passed: violations.length === 0,
  })

  return {
    originalScore: score,
    cap: MAX_PER_SIGNAL_IMPACT,
    signals: signalRows,
    dimensions: dimensionRows,
    violations,
    passed: violations.length === 0,
    maxImpactSignal,
  }
}
