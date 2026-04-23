import { Check, Loader2, Circle } from "lucide-react"
import { cn } from "@/lib/utils"

export type ProcessingStep = {
  label: string
  status: "pending" | "active" | "complete" | "error"
}

type Props = {
  steps: ProcessingStep[]
  progress: number
  etaSeconds?: number
  title?: string
}

export function ProcessingSteps({
  steps,
  progress,
  etaSeconds,
  title = "Computing stability score",
}: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-card p-6 shadow-sm dark:border-slate-800">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Querying data sources and running the stability model.
          </p>
        </div>
        {typeof etaSeconds === "number" && etaSeconds > 0 && (
          <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
            ~{Math.max(1, Math.round(etaSeconds))}s remaining
          </span>
        )}
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full bg-indigo-500 transition-all duration-500 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
      <ol className="mt-6 space-y-3">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                step.status === "complete" &&
                  "border-emerald-500 bg-emerald-500 text-white",
                step.status === "active" &&
                  "border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
                step.status === "pending" &&
                  "border-slate-200 bg-card text-slate-400 dark:border-slate-800",
                step.status === "error" &&
                  "border-rose-500 bg-rose-500 text-white",
              )}
            >
              {step.status === "complete" && <Check className="h-3.5 w-3.5" />}
              {step.status === "active" && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              {step.status === "pending" && (
                <Circle className="h-2 w-2 fill-current" />
              )}
              {step.status === "error" && <span className="text-xs">!</span>}
            </span>
            <span
              className={cn(
                "text-sm",
                step.status === "active" && "font-medium text-foreground",
                step.status === "complete" && "text-muted-foreground",
                step.status === "pending" && "text-muted-foreground/70",
              )}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
