import { env } from '@/lib/env'
import { supabase } from '@/lib/supabase'

export type CheckStatus = 'ok' | 'error' | 'missing'

export interface HealthCheck {
  status: CheckStatus
  detail: string | null
  latency_ms: number | null
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down'
  service: string
  checks: Record<string, HealthCheck>
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Call the FastAPI backend. Attaches the Supabase access token so the backend knows who is asking. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const token = (await supabase?.auth.getSession())?.data.session?.access_token
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${env.apiUrl}${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ApiError(res.status, body || res.statusText)
  }
  return (await res.json()) as T
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${env.apiUrl}/health`, { signal })
  if (!res.ok) throw new ApiError(res.status, res.statusText)
  return (await res.json()) as HealthResponse
}
