"use client"

import { useEffect, useState } from "react"
import {
  ProcessingSteps,
  type ProcessingStep,
} from "@/components/shared/processing-steps"

const STEP_LABELS = [
  "Fetching financial data from Tiingo",
  "Retrieving news articles from NewsAPI",
  "Analyzing sentiment patterns",
  "Computing dimensional scores",
  "Generating stability analysis",
]

type Props = {
  ticker: string
  durationMs?: number
  onComplete: () => void
}

export function ScoreLoading({ ticker, durationMs = 3200, onComplete }: Props) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const stepInterval = durationMs / STEP_LABELS.length
    const timer = setInterval(() => {
      setTick((t) => {
        if (t >= STEP_LABELS.length) {
          clearInterval(timer)
          return t
        }
        return t + 1
      })
    }, stepInterval)
    return () => clearInterval(timer)
  }, [durationMs])

  useEffect(() => {
    if (tick >= STEP_LABELS.length) {
      const t = setTimeout(onComplete, 300)
      return () => clearTimeout(t)
    }
  }, [tick, onComplete])

  const steps: ProcessingStep[] = STEP_LABELS.map((label, i) => ({
    label: `${label}...`,
    status:
      i < tick
        ? "complete"
        : i === tick
          ? "active"
          : "pending",
  }))

  const progress = Math.min(100, (tick / STEP_LABELS.length) * 100)
  const etaSeconds = Math.max(0, ((STEP_LABELS.length - tick) * durationMs) / STEP_LABELS.length / 1000)

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center px-4 py-10">
      <div className="w-full animate-fade-in-up">
        <div className="mb-5 flex items-baseline gap-3">
          <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
            {ticker}
          </span>
          <span className="text-sm text-muted-foreground">
            Running stability analysis
          </span>
        </div>
        <ProcessingSteps
          steps={steps}
          progress={progress}
          etaSeconds={etaSeconds}
        />
      </div>
    </div>
  )
}
