import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect, useId, useLayoutEffect, useRef } from 'react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/auth-context'

/**
 * Subscribe to Postgres changes on `table` via Supabase Realtime and invalidate the given queries.
 * RLS applies to Realtime too, so users only receive rows for their own hospital.
 */
export function useRealtimeInvalidate(table: string, queryKeys: QueryKey[]) {
  const qc = useQueryClient()
  const userId = useAuth().session?.user.id
  const id = useId()
  const keys = useRef(queryKeys)
  useLayoutEffect(() => {
    keys.current = queryKeys
  })

  useEffect(() => {
    if (!supabase || !userId) return
    const client = supabase
    const channel = client
      .channel(`rt:${table}:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        for (const queryKey of keys.current) qc.invalidateQueries({ queryKey })
      })
      .subscribe()
    return () => {
      client.removeChannel(channel)
    }
  }, [table, id, qc, userId])
}
