import type { Session } from '@supabase/supabase-js'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { queryClient } from '@/lib/query-client'
import { supabase } from '@/lib/supabase'
import { AuthContext, type AuthContextValue } from '@/providers/auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (!next) queryClient.clear()
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      configured: Boolean(supabase),
      signIn: async (email, password) => {
        if (!supabase) throw new Error('Supabase is not configured')
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      },
      signOut: async () => {
        await supabase?.auth.signOut()
      },
    }),
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
