"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { useEffect, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Logo } from "@/components/shared/logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordStrength } from "@/components/shared/password-strength"
import { useAuth } from "@/components/providers/auth-provider"

export default function SignupPage() {
  const router = useRouter()
  const { signup, isAuthenticated } = useAuth()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/dashboard")
    }
  }, [isAuthenticated, router])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const ok = await signup(name, email, password)
      if (!ok) {
        toast.error("Could not create account. Please check your inputs.")
        return
      }
      toast.success("Account created! Welcome to StabilityScope.")
      router.push("/dashboard")
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Could not create account. Please try again."
      if (message.toLowerCase().includes("rate limit")) {
        toast.error("Signup rate limit hit. Please wait a minute and try again.")
      } else {
        toast.error(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-md animate-fade-in-up">
      <div className="mb-6 flex flex-col items-center gap-3">
        <Logo size={40} showWordmark={false} />
        <h1 className="text-2xl font-semibold tracking-tight">
          Stability
          <span className="text-indigo-600 dark:text-indigo-400">Scope</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Create an account to start scoring stocks
        </p>
      </div>
      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-slate-200 bg-card p-6 shadow-sm dark:border-slate-800"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              placeholder="Ada Lovelace"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>
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
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
            />
            <PasswordStrength password={password} />
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="h-11 w-full bg-indigo-600 font-semibold text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : (
              "Create Account"
            )}
          </Button>
        </div>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Log in
        </Link>
      </p>
    </div>
  )
}
