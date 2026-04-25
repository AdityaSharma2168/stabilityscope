/** Bump when scoring output meaningfully changes so stale Redis JSON is rejected. */
export const SCORE_PIPELINE_VERSION = 4 as const

/** Redis key for cached StabilityScore JSON. Bump prefix when you need to drop all prior blobs at once. */
export function stabilityScoreCacheKey(userId: string, ticker: string): string {
  return `score:v${SCORE_PIPELINE_VERSION}:${userId}:${ticker.toUpperCase()}`
}
