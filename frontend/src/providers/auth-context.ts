import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export interface AuthContextValue {
  session: Session | null
  loading: boolean
  /** false when frontend/.env has no Supabase keys — the app runs in "setup mode". */
  configured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
