import { createClient, type SupabaseClient } from "@supabase/supabase-js"

type SupabaseBrowserClient = SupabaseClient

let client: SupabaseBrowserClient | null = null

/**
 * Lazily-instantiated browser-side Supabase client. Created on first access
 * so that `next build` (which evaluates module top-level code without runtime
 * env vars) doesn't crash.
 */
export function getSupabaseClient(): SupabaseBrowserClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    )
  }
  return client
}

/**
 * Backwards-compat proxy: keeps existing `supabase.auth.*` / `supabase.from(...)`
 * call sites working unchanged. Every property access lazily materializes the
 * underlying client.
 */
export const supabase = new Proxy({} as SupabaseBrowserClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabaseClient() as object, prop, receiver)
  },
})
