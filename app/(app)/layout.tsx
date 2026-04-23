import type { ReactNode } from "react"
import { AuthGuard } from "@/components/app-shell/auth-guard"
import { Header } from "@/components/app-shell/header"
import { Sidebar } from "@/components/app-shell/sidebar"

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-dvh bg-background">
        <Sidebar className="hidden md:flex md:fixed md:inset-y-0 md:left-0" />
        <div className="flex min-h-dvh flex-1 flex-col md:ml-[220px]">
          <Header />
          <main className="flex-1 animate-fade-in">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  )
}
