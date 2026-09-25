/** Dashboard reads — supabase-js under RLS, cached with TanStack Query, refreshed by Realtime. */
import { useQuery } from '@tanstack/react-query'

import { AGENT_META } from '@/lib/agents'
import { requireSupabase } from '@/lib/supabase'
import { istDayStart } from '@/lib/time'
import type { AgentRow, EscalationRow, LiveCallRow, TenantMembership } from '@/lib/types'

export const LIVE_STATUSES = ['ringing', 'in_progress'] as const

export const queryKeys = {
  tenant: ['tenant'] as const,
  agents: ['agents'] as const,
  liveCalls: ['calls', 'live'] as const,
  openEscalations: ['escalations', 'open'] as const,
  kpis: ['kpis'] as const,
}

export function useTenant() {
  return useQuery({
    queryKey: queryKeys.tenant,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('tenant_members')
        .select('role, full_name, tenant:tenants(id, name)')
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as unknown as TenantMembership | null
    },
  })
}

export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents,
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('agents').select('id, key, name, description, status, languages')
      if (error) throw error
      return (data as AgentRow[]).sort((a, b) => (AGENT_META[a.key]?.order ?? 99) - (AGENT_META[b.key]?.order ?? 99))
    },
  })
}

export function useLiveCalls() {
  return useQuery({
    queryKey: queryKeys.liveCalls,
    // Realtime drives updates; the interval is a safety net if the socket drops.
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('calls')
        .select(
          'id, agent_id, status, direction, language, from_number, to_number, started_at, answered_at, created_at, agent:agents(key, name), patient:patients(full_name)',
        )
        .in('status', LIVE_STATUSES)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as unknown as LiveCallRow[]
    },
  })
}

export function useOpenEscalations() {
  return useQuery({
    queryKey: queryKeys.openEscalations,
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('escalations')
        .select('id, severity, reason, status, call_id, created_at, patient:patients(full_name)')
        .in('status', ['open', 'acknowledged'])
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data as unknown as EscalationRow[]
    },
  })
}

export interface Kpis {
  callsToday: number
  callsSameTimeYesterday: number
  bookedToday: number
  bookedSameTimeYesterday: number
  followUpsDueToday: number
  openEscalations: number
  criticalEscalations: number
}

export function useKpis() {
  return useQuery({
    queryKey: queryKeys.kpis,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<Kpis> => {
      const sb = requireSupabase()
      const now = Date.now()
      const today = istDayStart(0, now).toISOString()
      const tomorrow = istDayStart(1, now).toISOString()
      const yesterday = istDayStart(-1, now).toISOString()
      const sameTimeYesterday = new Date(now - 86_400_000).toISOString()
      const count = { count: 'exact' as const, head: true }

      const results = await Promise.all([
        sb.from('calls').select('id', count).gte('created_at', today),
        sb.from('calls').select('id', count).gte('created_at', yesterday).lt('created_at', sameTimeYesterday),
        sb.from('appointments').select('id', count).gte('created_at', today),
        sb.from('appointments').select('id', count).gte('created_at', yesterday).lt('created_at', sameTimeYesterday),
        sb.from('follow_ups').select('id', count).gte('due_at', today).lt('due_at', tomorrow).in('status', ['scheduled', 'in_progress']),
        sb.from('escalations').select('id', count).eq('status', 'open'),
        sb.from('escalations').select('id', count).eq('status', 'open').eq('severity', 'critical'),
      ])
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
      const [c0, c1, a0, a1, f0, e0, e1] = results.map((r) => r.count ?? 0)
      return {
        callsToday: c0,
        callsSameTimeYesterday: c1,
        bookedToday: a0,
        bookedSameTimeYesterday: a1,
        followUpsDueToday: f0,
        openEscalations: e0,
        criticalEscalations: e1,
      }
    },
  })
}
