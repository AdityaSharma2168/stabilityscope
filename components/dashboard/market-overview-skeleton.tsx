import { Skeleton } from "@/components/ui/skeleton"

export function MarketOverviewSkeleton() {
  return (
    <section className="rounded-xl border border-slate-200 bg-card p-4 shadow-sm dark:border-slate-800">
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-10" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
          >
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>
    </section>
  )
}
