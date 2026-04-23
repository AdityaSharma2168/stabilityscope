"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Clock, Download, Search } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { ScoreBadge } from "@/components/shared/score-badge"
import { SegmentBadge } from "@/components/shared/segment-badge"
import { CacheIndicator } from "@/components/shared/cache-indicator"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDateTime, formatMs } from "@/lib/score-utils"
import { useHistory } from "@/hooks/use-history"

const PAGE_SIZE = 25

export default function HistoryPage() {
  const router = useRouter()
  const { entries, isLoading } = useHistory()
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q) return entries
    return entries.filter(
      (h) =>
        h.ticker.includes(q) || h.companyName.toUpperCase().includes(q),
    )
  }, [entries, query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginated = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )

  const exportCSV = () => {
    const headers = [
      "ID",
      "Ticker",
      "Company",
      "Score",
      "Segment",
      "ProcessingTime(ms)",
      "CacheHit",
      "AnalyzedAt",
    ]
    const rows = filtered.map((h) => [
      h.id,
      h.ticker,
      `"${h.companyName}"`,
      h.score.toString(),
      `"${h.segment}"`,
      h.processingTime.toString(),
      h.cacheHit ? "true" : "false",
      h.analyzedAt,
    ])
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `stabilityscope-history-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${filtered.length} analyses`)
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      <PageHeader
        title="Analysis History"
        subtitle="View all past stability analyses"
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={exportCSV}
            disabled={isLoading || filtered.length === 0}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filter by ticker or company..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(1)
          }}
          disabled={isLoading}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-card dark:border-slate-800">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead className="hidden md:table-cell">Company</TableHead>
                <TableHead>Score</TableHead>
                <TableHead className="hidden xl:table-cell">Segment</TableHead>
                <TableHead className="hidden sm:table-cell">Time</TableHead>
                <TableHead className="hidden sm:table-cell">Cache</TableHead>
                <TableHead>Analyzed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 8 }).map((_, i) => (
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
                  <TableCell className="hidden xl:table-cell">
                    <Skeleton className="h-5 w-40 rounded-full" />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Skeleton className="h-3 w-12" />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Skeleton className="h-4 w-14 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-3 w-24" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No analyses found"
          description={
            query
              ? `No analyses match "${query}". Try another search term.`
              : "You haven't run any analyses yet. Start by searching a ticker."
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-card dark:border-slate-800">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead className="hidden md:table-cell">Company</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="hidden xl:table-cell">Segment</TableHead>
                  <TableHead className="hidden sm:table-cell">Time</TableHead>
                  <TableHead className="hidden sm:table-cell">Cache</TableHead>
                  <TableHead>Analyzed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((entry) => (
                  <TableRow
                    key={entry.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/score/${entry.ticker}`)}
                  >
                    <TableCell className="font-mono font-bold">
                      {entry.ticker}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {entry.companyName}
                    </TableCell>
                    <TableCell>
                      <ScoreBadge score={entry.score} size="sm" />
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <SegmentBadge segment={entry.segment} />
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                      {formatMs(entry.processingTime)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <CacheIndicator hit={entry.cacheHit} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(entry.analyzedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Page {currentPage} of {totalPages} · {filtered.length} total
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
