import { logger } from "../../lib/logger"
import type { Dimension, Signal } from "../../lib/types"

/** Per the spec: no single news signal may shift the score by more than 5 points. */
export const MAX_PER_SIGNAL_IMPACT = 5

/**
 * Weighted sum of dimension scores. We assume the weights already sum to 1.0
 * (they do for the canonical six-dimension set), but defensively renormalize
 * if a caller has dropped a dimension.
 */
export function computeCompositeScore(dimensions: Dimension[]): number {
  if (dimensions.length === 0) return 0
  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0)
  const denom = totalWeight > 0 ? totalWeight : 1
  const weighted = dimensions.reduce((sum, d) => sum + d.score * (d.weight / denom), 0)
  const rounded = Math.round(Math.max(0, Math.min(100, weighted)))
  logger.info({ action: "composite_score", score: rounded, dimensionCount: dimensions.length })
  return rounded
}

/**
 * Segmentation logic from the context doc — financial dimensions average vs
 * sentiment dimensions average, both compared against a 60 threshold.
 */
export function assignSegment(dimensions: Dimension[]): string {
  const financial = dimensions.filter((d) => d.category === "financial")
  const sentiment = dimensions.filter((d) => d.category === "sentiment")

  const avg = (xs: Dimension[]): number =>
    xs.length === 0 ? 0 : xs.reduce((sum, d) => sum + d.score, 0) / xs.length

  const financialAvg = avg(financial)
  const sentimentAvg = avg(sentiment)

  let segment: string
  if (financialAvg >= 60 && sentimentAvg >= 60) {
    segment = "Fundamentally Strong, Reputationally Clean"
  } else if (financialAvg >= 60 && sentimentAvg < 60) {
    segment = "Financially Strong, Reputation Declining"
  } else if (financialAvg < 60 && sentimentAvg >= 60) {
    segment = "Financially Weak, Sentiment Propped"
  } else {
    segment = "Distressed"
  }

  logger.info({
    action: "segment_assigned",
    segment,
    financialAvg: Number(financialAvg.toFixed(2)),
    sentimentAvg: Number(sentimentAvg.toFixed(2)),
  })

  return segment
}

/**
 * Robustness rule from the spec: "no single article can change the score by
 * more than 5 points". Apply to a freshly built signal list before persistence.
 * Negative signals stay negative, positive stay positive — only the magnitude
 * is clipped.
 */
export function capSignalImpact(signal: Signal): Signal {
  if (signal.impact === 0) return signal
  const sign = Math.sign(signal.impact)
  const capped = sign * Math.min(Math.abs(signal.impact), MAX_PER_SIGNAL_IMPACT)
  if (capped === signal.impact) return signal
  return { ...signal, impact: capped }
}

export function capSignals(signals: Signal[]): Signal[] {
  return signals.map(capSignalImpact)
}

export function applyRobustnessCaps(signals: {
  positive: Signal[]
  negative: Signal[]
}): { positive: Signal[]; negative: Signal[] } {
  return {
    positive: capSignals(signals.positive),
    negative: capSignals(signals.negative),
  }
}
