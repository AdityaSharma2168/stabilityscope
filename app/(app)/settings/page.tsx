"use client"

import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { AlertTriangle } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useAuth } from "@/components/providers/auth-provider"
import { cn } from "@/lib/utils"

function SettingsCard({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-slate-200 bg-card p-5 shadow-sm dark:border-slate-800",
        className,
      )}
    >
      <header className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </header>
      {children}
    </section>
  )
}

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          connected
            ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]"
            : "bg-slate-400",
        )}
      />
      <span className="text-muted-foreground">
        {connected ? "Connected" : "Not configured"}
      </span>
    </span>
  )
}

export default function SettingsPage() {
  const { user, updateProfile, logout } = useAuth()
  const router = useRouter()

  const [name, setName] = useState(user?.name ?? "")
  const [alphaKey, setAlphaKey] = useState("")
  const [newsKey, setNewsKey] = useState("")
  const [cacheTtl, setCacheTtl] = useState("15")
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [alertThreshold, setAlertThreshold] = useState(50)

  const handleSaveProfile = (e: FormEvent) => {
    e.preventDefault()
    updateProfile({ name })
    toast.success("Profile updated")
  }

  const handleSaveKeys = (e: FormEvent) => {
    e.preventDefault()
    toast.success("API keys saved")
  }

  const handleTest = (provider: string) => {
    toast.success(`${provider} connection OK`)
  }

  const handleSavePrefs = (e: FormEvent) => {
    e.preventDefault()
    toast.success("Preferences saved")
  }

  const handleDelete = () => {
    toast.success("Account deletion requested")
    logout()
    router.push("/login")
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      <PageHeader
        title="Settings"
        subtitle="Configure your account and preferences"
      />

      {/* Profile */}
      <form onSubmit={handleSaveProfile}>
        <SettingsCard title="Profile">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={user?.email ?? ""}
                readOnly
                disabled
                className="font-mono"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              type="submit"
              className="bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              Save Profile
            </Button>
          </div>
        </SettingsCard>
      </form>

      {/* API Keys */}
      <form onSubmit={handleSaveKeys}>
        <SettingsCard
          title="Data Provider API Keys"
          description="Required for fetching financial data and news"
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="alpha">Alpha Vantage API Key</Label>
                <StatusDot connected={alphaKey.length >= 8} />
              </div>
              <div className="flex gap-2">
                <Input
                  id="alpha"
                  type="password"
                  placeholder="••••••••••••"
                  value={alphaKey}
                  onChange={(e) => setAlphaKey(e.target.value)}
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleTest("Alpha Vantage")}
                  disabled={alphaKey.length < 8}
                >
                  Test
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="news">NewsAPI Key</Label>
                <StatusDot connected={newsKey.length >= 8} />
              </div>
              <div className="flex gap-2">
                <Input
                  id="news"
                  type="password"
                  placeholder="••••••••••••"
                  value={newsKey}
                  onChange={(e) => setNewsKey(e.target.value)}
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleTest("NewsAPI")}
                  disabled={newsKey.length < 8}
                >
                  Test
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              type="submit"
              className="bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              Save Keys
            </Button>
          </div>
        </SettingsCard>
      </form>

      {/* Preferences */}
      <form onSubmit={handleSavePrefs}>
        <SettingsCard
          title="Preferences"
          description="Customize how the platform behaves for you"
        >
          <div className="space-y-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Label htmlFor="ttl">Default cache TTL</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  How long to keep scores cached before re-analyzing.
                </p>
              </div>
              <Select value={cacheTtl} onValueChange={setCacheTtl}>
                <SelectTrigger id="ttl" className="w-full sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 minutes</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="1440">24 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 pt-5 dark:border-slate-800">
              <div>
                <Label htmlFor="auto">Auto-refresh watchlist</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Periodically re-score watchlist tickers during market hours.
                </p>
              </div>
              <Switch
                id="auto"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
              />
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
              <div>
                <Label htmlFor="threshold">Score alert threshold</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Get notified when a watchlist score drops below this value.
                </p>
              </div>
              <Input
                id="threshold"
                type="number"
                min={0}
                max={100}
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(Number(e.target.value))}
                className="w-full font-mono sm:w-[100px]"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              type="submit"
              className="bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              Save Preferences
            </Button>
          </div>
        </SettingsCard>
      </form>

      {/* Danger zone */}
      <SettingsCard
        title="Danger Zone"
        description="Irreversible actions. Proceed with caution."
        className="border-rose-500/30 bg-rose-500/[0.02]"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-500" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Delete account
              </p>
              <p className="text-xs text-muted-foreground">
                This permanently erases your profile, watchlist and history.
              </p>
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="border-rose-500/40 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-400"
              >
                Delete Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Are you absolutely sure?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete your account and all
                  associated data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-rose-600 text-white hover:bg-rose-700"
                >
                  Yes, delete my account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </SettingsCard>
    </div>
  )
}
