"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { authedFetch } from "@/lib/authed-fetch"
import type { StabilityScore } from "@/lib/types"

type ScoreSubmitResponse = {
  score?: StabilityScore
  jobId?: string
}

type JobStatusResponse = {
  status: "queued" | "processing" | "completed" | "failed"
  resultId?: string
}

async function submitScore(ticker: string, force: boolean): Promise<ScoreSubmitResponse> {
  const response = await authedFetch("/api/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      ticker,
      ...(force ? { force: true } : {}),
    }),
  })
  if (!response.ok) throw new Error("Failed to submit score job")
  return (await response.json()) as ScoreSubmitResponse
}

async function pollJob(jobId: string): Promise<JobStatusResponse> {
  const response = await authedFetch(`/api/jobs/${jobId}`, {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error("Failed to poll score job")
  return (await response.json()) as JobStatusResponse
}

async function fetchScoreById(id: string): Promise<StabilityScore> {
  const response = await authedFetch(`/api/scores/${id}`, {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error("Failed to fetch score details")
  const payload = (await response.json()) as { score: StabilityScore }
  return payload.score
}

export function useScoreDetail(ticker: string) {
  const [score, setScore] = useState<StabilityScore | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const forceNextRef = useRef(false)

  useEffect(() => {
    if (!ticker) return
    let cancelled = false
    let interval: ReturnType<typeof setInterval> | undefined

    const run = async () => {
      const force = forceNextRef.current
      if (force) {
        setScore(null)
      }
      setIsLoading(true)

      try {
        const submitResult = await submitScore(ticker, force)
        forceNextRef.current = false
        if (cancelled) return

        if (submitResult.score) {
          setScore(submitResult.score)
          setIsLoading(false)
          return
        }

        if (!submitResult.jobId) {
          setIsLoading(false)
          return
        }

        interval = setInterval(async () => {
          try {
            const job = await pollJob(submitResult.jobId as string)
            if (cancelled) return

            if (job.status === "completed" && job.resultId) {
              if (interval) clearInterval(interval)
              const finalScore = await fetchScoreById(job.resultId)
              if (cancelled) return
              setScore(finalScore)
              setIsLoading(false)
              return
            }

            if (job.status === "failed") {
              if (interval) clearInterval(interval)
              setIsLoading(false)
            }
          } catch {
            if (interval) clearInterval(interval)
            if (!cancelled) setIsLoading(false)
          }
        }, 2000)
      } catch {
        if (!cancelled) setIsLoading(false)
      }
    }

    void run()

    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
    }
  }, [ticker, reloadKey])

  const refresh = useCallback(() => {
    forceNextRef.current = true
    setReloadKey((k) => k + 1)
  }, [])

  return { score, isLoading, refresh }
}
