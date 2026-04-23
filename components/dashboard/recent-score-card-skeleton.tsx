import { Skeleton } from "@/components/ui/skeleton"

export function RecentScoreCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-card p-4 shadow-sm dark:border-slate-800">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-9 w-14 rounded-md" />
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  )
}
