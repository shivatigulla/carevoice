import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { env, isSupabaseConfigured } from '@/lib/env'

/**
 * Browser Supabase client: anon key + the signed-in user's session, so every read is filtered by RLS.
 * Reads + Realtime only. Important writes go through the FastAPI backend.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new ConfigError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to frontend/.env.')
  }
  return supabase
}
