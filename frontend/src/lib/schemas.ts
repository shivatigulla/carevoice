/**
 * Zod schemas for everything that crosses a trust boundary in the browser:
 *   - build-time public config (VITE_*),
 *   - requests we send to the FastAPI backend and the responses we get back,
 *   - user input (login form, phone numbers).
 * The backend re-validates every request with Pydantic; these schemas stop bad data earlier and make the
 * UI fail loudly instead of rendering something wrong.
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------------------------
// Public config
// ---------------------------------------------------------------------------------------------

function jwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return (JSON.parse(json) as { role?: string }).role ?? null
  } catch {
    return null
  }
}

/** A Supabase key that is safe in the browser: the anon/publishable key, never a secret/service-role key. */
export const browserSupabaseKey = z
  .string()
  .trim()
  .min(20, 'Supabase key looks too short')
  .refine((k) => !k.startsWith('sb_secret_'), 'This is a Supabase SECRET key — only the anon/publishable key may be used in the browser')
  .refine((k) => !k.startsWith('eyJ') || jwtRole(k) !== 'service_role', 'This is the service_role key — it must never be shipped to the browser')

const httpUrl = z.url({ protocol: /^https?$/ })

export const publicEnvSchema = z.object({
  VITE_SUPABASE_URL: httpUrl.optional().or(z.literal('')),
  VITE_SUPABASE_ANON_KEY: browserSupabaseKey.optional().or(z.literal('')),
  VITE_API_URL: httpUrl.optional().or(z.literal('')),
  VITE_VOICE_URL: httpUrl.optional().or(z.literal('')),
})

// ---------------------------------------------------------------------------------------------
// User input
// ---------------------------------------------------------------------------------------------

/** Phone as typed by staff: spaces/dashes allowed; 10 digits (India) or full international number. */
export const phoneInputSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-().]/g, ''))
  .refine((v) => /^(\+?[1-9]\d{9,14}|0\d{10})$/.test(v), 'Enter a valid phone number, e.g. +91 98765 43210')

export const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

// ---------------------------------------------------------------------------------------------
// Backend API — requests
// ---------------------------------------------------------------------------------------------

export const callPurposeSchema = z.enum(['reminder', 'missed', 'post_visit', 'booking'])

export const outboundCallRequestSchema = z
  .object({
    phone: phoneInputSchema.optional(),
    patient_id: z.uuid().optional(),
    appointment_id: z.uuid().optional(),
    purpose: callPurposeSchema.default('reminder'),
  })
  .refine((b) => b.phone || b.patient_id, { message: 'A phone number or a patient is required' })

// ---------------------------------------------------------------------------------------------
// Backend API — responses
// ---------------------------------------------------------------------------------------------

export const healthCheckSchema = z.object({
  status: z.enum(['ok', 'error', 'missing']),
  detail: z.string().nullable(),
  latency_ms: z.number().int().nullable(),
})

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  service: z.string(),
  checks: z.record(z.string(), healthCheckSchema),
})

export const outboundCallResponseSchema = z.object({
  call_id: z.uuid(),
  execution_id: z.string().min(1),
  patient: z.string().nullable(),
})

export const checkInResponseSchema = z.object({
  id: z.uuid(),
  status: z.literal('checked_in'),
  checked_in_at: z.string().nullable(),
})

/** FastAPI error body: {"detail": "..."} or a list of validation issues. */
export const apiErrorBodySchema = z.object({
  detail: z.union([z.string(), z.array(z.object({ msg: z.string() }).loose())]),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>
export type OutboundCallRequest = z.input<typeof outboundCallRequestSchema>
export type OutboundCallResponse = z.infer<typeof outboundCallResponseSchema>
