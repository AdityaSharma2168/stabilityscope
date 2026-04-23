"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { scoreColorClasses } from "@/lib/score-utils"

type Props = {
  score: number
  size?: number
  className?: string
  label?: string
}

// Semicircular gauge. Arc is drawn from 180° to 360° (left to right, top).
// Score 0 -> left end; Score 100 -> right end.
export function ScoreGauge({ score, size = 240, className, label }: Props) {
  const [displayed, setDisplayed] = useState(0)
  const clamped = Math.max(0, Math.min(100, score))

  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const duration = 1200
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplayed(clamped * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [clamped])

  const width = size
  const height = size / 2 + 24
  const cx = width / 2
  const cy = size / 2
  const r = size / 2 - 18
  const strokeW = 18

  // Arc helpers
  const polar = (angleDeg: number, radius: number) => {
    const rad = (angleDeg * Math.PI) / 180
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
  }

  const describeArc = (startAngle: number, endAngle: number, radius: number) => {
    const start = polar(endAngle, radius)
    const end = polar(startAngle, radius)
    const largeArc = endAngle - startAngle <= 180 ? 0 : 1
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`
  }

  // Sections: 180 -> 360 total = 180 degrees
  // 0-39 (rose) = 180 + 0..70.2
  // 40-69 (amber) = 180 + 70.2..126
  // 70-100 (emerald) = 180 + 126..180
  const seg = (pct: number) => 180 + (pct / 100) * 180

  // Needle angle for displayed value
  const needleAngle = seg(displayed)
  const needleOuter = polar(needleAngle, r - 4)

  const colors = scoreColorClasses(clamped)

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
        aria-label={`Stability score ${Math.round(clamped)} out of 100`}
        role="img"
      >
        {/* Track */}
        <path
          d={describeArc(180, 360, r)}
          stroke="currentColor"
          className="text-slate-200 dark:text-slate-800"
          strokeWidth={strokeW}
          fill="none"
          strokeLinecap="round"
        />
        {/* Rose section 0-39 */}
        <path
          d={describeArc(180, seg(39), r)}
          stroke="#f43f5e"
          strokeWidth={strokeW}
          fill="none"
          strokeLinecap="round"
          opacity={0.85}
        />
        {/* Amber section 40-69 */}
        <path
          d={describeArc(seg(40), seg(69), r)}
          stroke="#f59e0b"
          strokeWidth={strokeW}
          fill="none"
          opacity={0.85}
        />
        {/* Emerald section 70-100 */}
        <path
          d={describeArc(seg(70), 360, r)}
          stroke="#10b981"
          strokeWidth={strokeW}
          fill="none"
          strokeLinecap="round"
          opacity={0.85}
        />
        {/* Tick marks */}
        {[0, 25, 50, 75, 100].map((v) => {
          const a = seg(v)
          const inner = polar(a, r - strokeW / 2 - 4)
          const outer = polar(a, r + strokeW / 2 + 4)
          return (
            <line
              key={v}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              className="stroke-slate-400 dark:stroke-slate-600"
              strokeWidth={1}
            />
          )
        })}
        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={needleOuter.x}
          y2={needleOuter.y}
          className="stroke-slate-900 dark:stroke-slate-100"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <circle
          cx={cx}
          cy={cy}
          r={7}
          className="fill-slate-900 dark:fill-slate-100"
        />
        <circle
          cx={cx}
          cy={cy}
          r={3}
          className="fill-slate-50 dark:fill-slate-900"
        />
      </svg>
      <div className="-mt-20 flex flex-col items-center">
        <span
          className={cn(
            "font-mono text-5xl font-bold tabular-nums leading-none",
            colors.text,
          )}
        >
          {Math.round(displayed)}
        </span>
        <span className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label ?? "Stability Score"}
        </span>
      </div>
    </div>
  )
}
