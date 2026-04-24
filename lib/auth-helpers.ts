import { createClient } from "@supabase/supabase-js"
import { cookies, headers } from "next/headers"

function extractAccessToken(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return null
    const token = (parsed as { access_token?: unknown }).access_token
    return typeof token === "string" ? token : null
  } catch {
    return null
  }
}

export async function getCurrentUserId(): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return null

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  const requestHeaders = await headers()
  const authHeader = requestHeaders.get("authorization")
  const bearerToken =
    authHeader && authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null

  if (bearerToken) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearerToken)
    if (!error && data.user) return data.user.id
  }

  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()

  const authCookie = allCookies.find((cookie) =>
    cookie.name.includes("-auth-token"),
  )
  if (!authCookie?.value) return null

  const accessToken = extractAccessToken(authCookie.value)
  if (!accessToken) return null

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken)
  if (error || !data.user) return null
  return data.user.id
}
