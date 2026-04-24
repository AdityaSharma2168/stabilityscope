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
import { type Session, type User as SupabaseUser } from "@supabase/supabase-js"

import { type User } from "@/data/mock-user"
import { supabase } from "@/lib/supabase-client"

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

function mapSupabaseUser(user: SupabaseUser): User {
  return {
    id: user.id,
    name: (user.user_metadata?.full_name as string | undefined) || "User",
    email: user.email || "",
    created_at: user.created_at || new Date().toISOString(),
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const restoreSession = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (!mounted) return

      if (error) {
        setSession(null)
        setUser(null)
        setIsLoading(false)
        return
      }

      setSession(data.session)
      setUser(data.session?.user ? mapSupabaseUser(data.session.user) : null)
      setIsLoading(false)
    }

    restoreSession()

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
        setUser(nextSession?.user ? mapSupabaseUser(nextSession.user) : null)
        setIsLoading(false)
      },
    )

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.user) return false

    setSession(data.session)
    setUser(mapSupabaseUser(data.user))
    return true
  }, [])

  const signup = useCallback(
    async (name: string, email: string, password: string): Promise<boolean> => {
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
            },
          },
        })

        if (error) {
          throw new Error(error.message)
        }
        if (!data.user) {
          throw new Error("No user was returned by Supabase signup.")
        }

        if (data.session) {
          const { error: profileError } = await supabase.from("profiles").upsert({
            id: data.user.id,
            full_name: name,
          })

          if (profileError) {
            console.warn("Profile upsert failed after signup:", profileError.message)
          }

          setSession(data.session)
          setUser(mapSupabaseUser(data.user))
        }

        return true
      } catch (err) {
        console.error("Signup failed:", err)
        throw err
      }
    },
    [],
  )

  const logout = useCallback(() => {
    void supabase.auth.signOut()
    setSession(null)
    setUser(null)
  }, [])

  const updateProfile = useCallback(
    (patch: Partial<Pick<User, "name" | "email">>) => {
      setUser((prev) => {
        if (!prev) return prev
        return { ...prev, ...patch }
      })
    },
    [],
  )

  const value = useMemo<AuthState>(
    () => ({
      user,
      isAuthenticated: !!session,
      isLoading,
      login,
      signup,
      logout,
      updateProfile,
    }),
    [user, session, isLoading, login, signup, logout, updateProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
