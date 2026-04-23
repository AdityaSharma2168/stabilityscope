"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { MOCK_USER, type User } from "@/data/mock-user"

type AuthState = {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<boolean>
  signup: (name: string, email: string, password: string) => Promise<boolean>
  logout: () => void
  updateProfile: (patch: Partial<Pick<User, "name" | "email">>) => void
}

const AuthContext = createContext<AuthState | null>(null)

const STORAGE_KEY = "stabilityscope:auth"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as User
        setUser(parsed)
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
    }
  }, [])

  const persist = useCallback((next: User | null) => {
    if (next) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const login = useCallback(
    async (email: string, _password: string): Promise<boolean> => {
      await new Promise((r) => setTimeout(r, 500))
      // mock: any non-empty email/password works
      if (!email) return false
      const next: User = { ...MOCK_USER, email }
      setUser(next)
      persist(next)
      return true
    },
    [persist],
  )

  const signup = useCallback(
    async (name: string, email: string, _password: string): Promise<boolean> => {
      await new Promise((r) => setTimeout(r, 500))
      if (!name || !email) return false
      const next: User = {
        ...MOCK_USER,
        name,
        email,
        created_at: new Date().toISOString(),
      }
      setUser(next)
      persist(next)
      return true
    },
    [persist],
  )

  const logout = useCallback(() => {
    setUser(null)
    persist(null)
  }, [persist])

  const updateProfile = useCallback(
    (patch: Partial<Pick<User, "name" | "email">>) => {
      setUser((prev) => {
        if (!prev) return prev
        const next = { ...prev, ...patch }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const value = useMemo<AuthState>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      signup,
      logout,
      updateProfile,
    }),
    [user, isLoading, login, signup, logout, updateProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
