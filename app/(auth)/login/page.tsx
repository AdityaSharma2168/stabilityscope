"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Logo } from "@/components/shared/logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/components/providers/auth-provider"

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    const ok = await login(email, password)
    setSubmitting(false)
    if (!ok) {
      toast.error("Invalid email or password")
      return
    }
    toast.success("Welcome back")
    router.push("/dashboard")
  }

  return (
    <div className="w-full max-w-md animate-fade-in-up">
      <div className="mb-6 flex flex-col items-center gap-3">
        <Logo size={40} showWordmark={false} />
        <h1 className="text-2xl font-semibold tracking-tight">
          Stability<span className="text-indigo-600 dark:text-indigo-400">Scope</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Real-time stock stability intelligence
        </p>
      </div>
      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-slate-200 bg-card p-6 shadow-sm dark:border-slate-800"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="#"
                className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="h-11 w-full bg-indigo-600 font-semibold text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              "Log In"
            )}
          </Button>
        </div>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Sign up
        </Link>
      </p>
    </div>
  )
}
