/**
 * Public runtime config. Only VITE_* values reach the browser — never put secrets here.
 * Validated with Zod at startup: a secret/service-role Supabase key is rejected outright, so a
 * misconfigured deploy fails closed (setup mode) instead of leaking privileged access.
 */
import { publicEnvSchema } from '@/lib/schemas'

const raw = {
  VITE_SUPABASE_URL: (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '',
  VITE_SUPABASE_ANON_KEY: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '',
  VITE_API_URL: (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? '',
  VITE_VOICE_URL: (import.meta.env.VITE_VOICE_URL as string | undefined)?.trim() ?? '',
}

const parsed = publicEnvSchema.safeParse(raw)

/** Human-readable config problems (shown in the console; the app falls back to setup mode). */
export const envIssues: string[] = parsed.success ? [] : parsed.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`)
if (envIssues.length) console.error('[CareVoice] Invalid public configuration:\n' + envIssues.join('\n'))

const bad = new Set(envIssues.map((i) => i.split(':')[0]))
const pick = (k: keyof typeof raw) => (bad.has(k) ? '' : raw[k])

export const env = {
  supabaseUrl: pick('VITE_SUPABASE_URL'),
  supabaseAnonKey: pick('VITE_SUPABASE_ANON_KEY'),
  apiUrl: (pick('VITE_API_URL') || 'http://localhost:8000').replace(/\/$/, ''),
  voiceUrl: (pick('VITE_VOICE_URL') || 'http://localhost:8001').replace(/\/$/, ''),
}

/** The browser voice test needs the local Pipecat voice service; hidden when VITE_VOICE_URL is not set. */
export const isVoiceServiceConfigured = Boolean(pick('VITE_VOICE_URL'))

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
