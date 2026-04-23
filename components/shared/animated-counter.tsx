"use client"

import { useEffect, useState } from "react"

type Props = {
  value: number
  durationMs?: number
  className?: string
  format?: (n: number) => string
}

export function AnimatedCounter({
  value,
  durationMs = 900,
  className,
  format,
}: Props) {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const from = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setCurrent(from + (value - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, durationMs])

  const display = format ? format(current) : Math.round(current).toString()
  return <span className={className}>{display}</span>
}
