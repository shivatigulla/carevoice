/** Public runtime config. Only VITE_* values reach the browser — never put secrets here. */
export const env = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '',
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '',
  apiUrl: ((import.meta.env.VITE_API_URL as string | undefined)?.trim() || 'http://localhost:8000').replace(/\/$/, ''),
  voiceUrl: ((import.meta.env.VITE_VOICE_URL as string | undefined)?.trim() || 'http://localhost:8001').replace(/\/$/, ''),
}

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
