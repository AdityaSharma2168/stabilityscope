"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Plus,
  Star,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { ScoreBadge } from "@/components/shared/score-badge"
import { SegmentBadge } from "@/components/shared/segment-badge"
import { ChangePill } from "@/components/shared/change-pill"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { relativeTime } from "@/lib/score-utils"
import { useWatchlist } from "@/hooks/use-watchlist"

type SortKey = "ticker" | "score" | "change" | "updated"
type SortDir = "asc" | "desc"

export default function WatchlistPage() {
  const router = useRouter()
  const { items, isLoading, addTicker, removeTicker } = useWatchlist()
  const [sortKey, setSortKey] = useState<SortKey>("score")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [addOpen, setAddOpen] = useState(false)
  const [newTicker, setNewTicker] = useState("")
  const [isAdding, setIsAdding] = useState(false)

  const sorted = useMemo(() => {
    const out = [...items]
    out.sort((a, b) => {
      let cmp = 0
      if (sortKey === "ticker") cmp = a.ticker.localeCompare(b.ticker)
      else if (sortKey === "score") cmp = a.score - b.score
      else if (sortKey === "change") cmp = a.change - b.change
      else cmp =
        new Date(a.lastUpdated).getTime() -
        new Date(b.lastUpdated).getTime()
      return sortDir === "asc" ? cmp : -cmp
    })
    return out
  }, [items, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc")
    else {
      setSortKey(key)
      setSortDir(key === "ticker" ? "asc" : "desc")
    }
  }

  const handleRemove = async (ticker: string) => {
    try {
      await removeTicker(ticker)
      toast.success(`${ticker} removed from watchlist`)
    } catch {
      toast.error(`Failed to remove ${ticker}`)
    }
  }

  const handleAdd = async () => {
    const t = newTicker.trim().toUpperCase()
    if (!t) return
    if (items.some((i) => i.ticker === t)) {
      toast.error(`${t} is already in your watchlist`)
      return
    }
    setIsAdding(true)
    try {
      await addTicker(t)
      toast.success(`${t} added to watchlist`)
      setAddOpen(false)
      setNewTicker("")
    } catch {
      toast.error(`Failed to add ${t}`)
    } finally {
      setIsAdding(false)
    }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k)
      return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      <PageHeader
        title="Watchlist"
        subtitle="Track stability scores for your saved tickers"
        actions={
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                <Plus className="h-4 w-4" />
                Add Ticker
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add ticker to watchlist</DialogTitle>
                <DialogDescription>
                  Enter a ticker symbol to track its stability score.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="ticker">Ticker</Label>
                <Input
                  id="ticker"
                  placeholder="AAPL"
                  value={newTicker}
                  onChange={(e) =>
                    setNewTicker(e.target.value.toUpperCase())
                  }
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  className="font-mono uppercase"
                  maxLength={10}
                  autoFocus
                  disabled={isAdding}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAddOpen(false)}
                  disabled={isAdding}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAdd}
                  disabled={isAdding}
                  className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                >
                  {isAdding && <Spinner className="size-4" />}
                  {isAdding ? "Adding..." : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-card dark:border-slate-800">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead className="hidden md:table-cell">Company</TableHead>
                <TableHead>Score</TableHead>
                <TableHead className="hidden lg:table-cell">Segment</TableHead>
                <TableHead>24h</TableHead>
                <TableHead className="hidden md:table-cell">
                  Last Updated
                </TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-12" />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-10 rounded-md" />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Skeleton className="h-5 w-40 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-12 rounded-full" />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Skeleton className="h-3 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-8 rounded-md" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={Star}
          title="No tickers in your watchlist"
          description="Add tickers to track their stability scores over time."
          action={
            <Button
              onClick={() => setAddOpen(true)}
              className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              <Plus className="h-4 w-4" />
              Add Ticker
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-card dark:border-slate-800">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button
                    onClick={() => toggleSort("ticker")}
                    className="flex items-center font-semibold hover:text-foreground"
                  >
                    Ticker
                    <SortIcon k="ticker" />
                  </button>
                </TableHead>
                <TableHead className="hidden md:table-cell">Company</TableHead>
                <TableHead>
                  <button
                    onClick={() => toggleSort("score")}
                    className="flex items-center font-semibold hover:text-foreground"
                  >
                    Score
                    <SortIcon k="score" />
                  </button>
                </TableHead>
                <TableHead className="hidden lg:table-cell">Segment</TableHead>
                <TableHead>
                  <button
                    onClick={() => toggleSort("change")}
                    className="flex items-center font-semibold hover:text-foreground"
                  >
                    24h
                    <SortIcon k="change" />
                  </button>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <button
                    onClick={() => toggleSort("updated")}
                    className="flex items-center font-semibold hover:text-foreground"
                  >
                    Last Updated
                    <SortIcon k="updated" />
                  </button>
                </TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((item) => (
                <TableRow
                  key={item.ticker}
                  className={cn("cursor-pointer")}
                  onClick={() => router.push(`/score/${item.ticker}`)}
                >
                  <TableCell className="font-mono font-bold">
                    {item.ticker}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {item.companyName}
                  </TableCell>
                  <TableCell>
                    <ScoreBadge score={item.score} size="sm" />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <SegmentBadge segment={item.segment} />
                  </TableCell>
                  <TableCell>
                    <ChangePill change={item.change} />
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {relativeTime(item.lastUpdated)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-rose-500"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemove(item.ticker)
                      }}
                      aria-label={`Remove ${item.ticker}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
