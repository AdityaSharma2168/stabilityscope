"use client"

import { Search } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react"
import { Button } from "@/components/ui/button"
import {
  DOW30_NOT_SUPPORTED_MESSAGE,
  isDow30Ticker,
  searchDow30,
  type Dow30Entry,
} from "@/lib/dow30"
import { cn } from "@/lib/utils"

type Props = {
  size?: "default" | "large"
  placeholder?: string
  onSubmit?: (ticker: string) => void
  className?: string
  autoFocus?: boolean
}

export function TickerSearch({
  size = "default",
  placeholder,
  onSubmit,
  className,
  autoFocus,
}: Props) {
  const router = useRouter()
  const [value, setValue] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const listboxId = "ticker-search-listbox"

  const matches = useMemo<Dow30Entry[]>(() => searchDow30(value, 8), [value])

  useEffect(() => {
    setActiveIndex(0)
  }, [value])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const goToTicker = (ticker: string) => {
    const upper = ticker.trim().toUpperCase()
    if (!upper) return
    if (!isDow30Ticker(upper)) {
      setError(DOW30_NOT_SUPPORTED_MESSAGE)
      setIsOpen(true)
      return
    }
    setError(null)
    setIsOpen(false)
    if (onSubmit) {
      onSubmit(upper)
    } else {
      router.push(`/score/${upper}`)
    }
    setValue("")
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (isOpen && matches.length > 0) {
      goToTicker(matches[activeIndex]?.ticker ?? value)
      return
    }
    goToTicker(value)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setIsOpen(true)
      setActiveIndex((prev) =>
        matches.length === 0 ? 0 : (prev + 1) % matches.length,
      )
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setIsOpen(true)
      setActiveIndex((prev) =>
        matches.length === 0
          ? 0
          : (prev - 1 + matches.length) % matches.length,
      )
    } else if (e.key === "Escape") {
      setIsOpen(false)
    }
  }

  const large = size === "large"
  const showDropdown = isOpen

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <form
        onSubmit={handleSubmit}
        className="flex w-full items-center gap-2"
        role="search"
      >
        <div className="relative flex-1">
          <Search
            className={cn(
              "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground",
              large ? "h-5 w-5" : "h-4 w-4",
            )}
          />
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value.toUpperCase())
              setError(null)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={
              placeholder ?? "Search DOW 30 (e.g., AAPL, MSFT, JPM)"
            }
            autoFocus={autoFocus}
            aria-label="Search ticker"
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={showDropdown}
            role="combobox"
            className={cn(
              "w-full rounded-xl border border-slate-200 bg-card font-mono uppercase tracking-wide text-foreground shadow-sm transition-all placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-800",
              large
                ? "h-14 pl-11 pr-4 text-lg font-bold"
                : "h-10 pl-9 pr-3 text-sm font-semibold",
            )}
            maxLength={10}
          />
        </div>
        <Button
          type="submit"
          size={large ? "lg" : "default"}
          className={cn(
            "bg-indigo-600 font-semibold text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400",
            large && "h-14 px-6 text-base",
          )}
        >
          Analyze
        </Button>
      </form>

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-2 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-popover text-popover-foreground shadow-lg dark:border-slate-800"
        >
          {error ? (
            <div className="px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
              {error}
            </div>
          ) : null}
          {matches.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              No DOW 30 ticker matches “{value}”.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {matches.map((entry, idx) => {
                const isActive = idx === activeIndex
                return (
                  <li
                    key={entry.ticker}
                    role="option"
                    aria-selected={isActive}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm",
                      isActive && "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
                    )}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      goToTicker(entry.ticker)
                    }}
                  >
                    <span className="font-mono text-xs font-bold tracking-wide">
                      {entry.ticker}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {entry.name}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
