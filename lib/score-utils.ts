import type { ScoreTier } from "./types"

export function scoreTier(score: number): ScoreTier {
  if (score >= 70) return "high"
  if (score >= 40) return "medium"
  return "low"
}

export function scoreColorClasses(score: number): {
  text: string
  bg: string
  border: string
  ring: string
  fill: string
} {
  const tier = scoreTier(score)
  if (tier === "high") {
    return {
      text: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10 dark:bg-emerald-500/15",
      border: "border-emerald-500/30 dark:border-emerald-500/30",
      ring: "ring-emerald-500/30",
      fill: "bg-emerald-500",
    }
  }
  if (tier === "medium") {
    return {
      text: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10 dark:bg-amber-500/15",
      border: "border-amber-500/30 dark:border-amber-500/30",
      ring: "ring-amber-500/30",
      fill: "bg-amber-500",
    }
  }
  return {
    text: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/10 dark:bg-rose-500/15",
    border: "border-rose-500/30 dark:border-rose-500/30",
    ring: "ring-rose-500/30",
    fill: "bg-rose-500",
  }
}

export function scoreHex(score: number): string {
  const tier = scoreTier(score)
  if (tier === "high") return "#10b981" // emerald-500
  if (tier === "medium") return "#f59e0b" // amber-500
  return "#f43f5e" // rose-500
}

export function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(days / 365)
  return `${years}y ago`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
