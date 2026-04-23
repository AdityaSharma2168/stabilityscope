import { cn } from "@/lib/utils"

type Props = {
  password: string
}

function score(pw: string): { score: number; label: string } {
  if (!pw) return { score: 0, label: "" }
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/\d/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong", "Excellent"]
  return { score: s, label: labels[s] ?? "Too short" }
}

export function PasswordStrength({ password }: Props) {
  const { score: s, label } = score(password)
  return (
    <div className="mt-1.5">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < s
                ? s <= 2
                  ? "bg-rose-500"
                  : s <= 3
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                : "bg-slate-200 dark:bg-slate-800",
            )}
          />
        ))}
      </div>
      {password && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Password strength: <span className="font-medium">{label}</span>
        </p>
      )}
    </div>
  )
}
