import { createClient, type SupabaseClient } from "@supabase/supabase-js"

type SupabaseAdminClient = SupabaseClient

let client: SupabaseAdminClient | null = null

/**
 * Lazily-instantiated server-side Supabase client. Created on first access so
 * that `next build` (which evaluates module top-level code without runtime
 * env vars) doesn't crash.
 */
export function getSupabaseAdmin(): SupabaseAdminClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    )
  }
  return client
}

/**
 * Backwards-compat proxy: keeps existing `supabaseAdmin.from(...)` call sites
 * working without forcing a full refactor. Every property access lazily
 * materializes the underlying client.
 */
export const supabaseAdmin = new Proxy({} as SupabaseAdminClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabaseAdmin() as object, prop, receiver)
  },
})
