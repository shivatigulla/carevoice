import type { z } from 'zod'

import { env } from '@/lib/env'
import {
  apiErrorBodySchema,
  checkInResponseSchema,
  healthResponseSchema,
  outboundCallRequestSchema,
  outboundCallResponseSchema,
  type HealthResponse,
  type OutboundCallRequest,
} from '@/lib/schemas'
import { supabase } from '@/lib/supabase'

export type { HealthResponse }
export type CheckStatus = HealthResponse['checks'][string]['status']

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Human-readable message from any error thrown by the API layer. */
export function apiErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong'
}

async function readError(res: Response): Promise<ApiError> {
  const raw = await res.text().catch(() => '')
  let message = raw || res.statusText
  try {
    const body = apiErrorBodySchema.safeParse(JSON.parse(raw))
    if (body.success) message = typeof body.data.detail === 'string' ? body.data.detail : body.data.detail.map((d) => d.msg).join('; ')
  } catch {
    /* not JSON */
  }
  return new ApiError(res.status, message)
}

/**
 * Call the FastAPI backend with the signed-in user's Supabase access token, and validate the response
 * against a Zod schema — an unexpected shape is an error, never silently rendered.
 */
export async function apiFetch<S extends z.ZodType>(path: string, schema: S, init: RequestInit = {}): Promise<z.infer<S>> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const token = (await supabase?.auth.getSession())?.data.session?.access_token
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${env.apiUrl}${path}`, { ...init, headers })
  if (!res.ok) throw await readError(res)
  const parsed = schema.safeParse(await res.json())
  if (!parsed.success) throw new ApiError(res.status, `Unexpected response from the server (${parsed.error.issues[0]?.message ?? 'invalid shape'})`)
  return parsed.data
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${env.apiUrl}/health`, { signal })
  if (!res.ok) throw new ApiError(res.status, res.statusText)
  return healthResponseSchema.parse(await res.json())
}

/** Place a real outbound phone call. The request body is validated before it leaves the browser. */
export function startOutboundCall(request: OutboundCallRequest) {
  const body = outboundCallRequestSchema.parse(request)
  return apiFetch('/api/calls/outbound', outboundCallResponseSchema, { method: 'POST', body: JSON.stringify(body) })
}

export function checkInAppointment(appointmentId: string) {
  return apiFetch(`/api/appointments/${encodeURIComponent(appointmentId)}/check-in`, checkInResponseSchema, { method: 'POST' })
}
