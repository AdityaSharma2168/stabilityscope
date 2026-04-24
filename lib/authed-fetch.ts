"use client"

import { supabase } from "@/lib/supabase-client"

export async function authedFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const headers = new Headers(init.headers)
  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  return fetch(input, { ...init, headers })
}
