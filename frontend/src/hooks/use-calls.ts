/** Call-center reads: follow-up queue from hospital records, recent calls, one call's full record. */
import { useQuery } from '@tanstack/react-query'

import type { Language } from '@/lib/agents'
import { requireSupabase } from '@/lib/supabase'
import { istDayStart } from '@/lib/time'

export type Purpose = 'reminder' | 'missed' | 'post_visit'

export interface QueueItem {
  key: string
  purpose: Purpose
  appointment_id: string
  starts_at: string
  reason: string | null
  patient: { id: string; name: string; phone: string; preferred_language: Language; opt_out: boolean; dnd: boolean }
  doctor: { name: string; department: { name: string } | null } | null
  lastCall: { id: string; status: string; outcome: string | null; started_at: string } | null
}

export interface CallRow {
  id: string
  direction: 'inbound' | 'outbound'
  channel: 'phone' | 'web'
  provider: string | null
  status: 'live' | 'completed' | 'failed' | 'no_answer'
  current_stage: string | null
  intent: string | null
  outcome: string | null
  languages: Language[]
  to_number: string | null
  from_number: string | null
  started_at: string
  duration_sec: number | null
  recording_path: string | null
  summary: { summary_en?: string | null; extracted?: unknown; hangup_by?: string | null } | null
  patient: { id: string; name: string } | null
}

export const CALL_SELECT =
  'id, direction, channel, provider, status, current_stage, intent, outcome, languages, to_number, from_number, ' +
  'started_at, duration_sec, recording_path, summary, patient:patients(id, name)'

const APPT =
  'id, starts_at, reason, status, patient:patients(id, name, phone, preferred_language, opt_out, dnd), doctor:doctors(name, department:departments(name))'

export function useFollowUpQueue() {
  return useQuery({
    queryKey: ['followup-queue'],
    refetchInterval: 30_000,
    queryFn: async (): Promise<QueueItem[]> => {
      const sb = requireSupabase()
      const now = Date.now()
      const [tomorrow, missed, visited] = await Promise.all([
        sb.from('appointments').select(APPT).gte('starts_at', istDayStart(1, now).toISOString()).lt('starts_at', istDayStart(2, now).toISOString()).in('status', ['booked', 'confirmed']).order('starts_at'),
        sb.from('appointments').select(APPT).eq('status', 'no_show').gte('starts_at', istDayStart(-14, now).toISOString()).order('starts_at', { ascending: false }),
        sb.from('appointments').select(APPT).eq('status', 'completed').gte('starts_at', istDayStart(-7, now).toISOString()).order('starts_at', { ascending: false }),
      ])
      const err = tomorrow.error ?? missed.error ?? visited.error
      if (err) throw err

      type Row = Omit<QueueItem, 'key' | 'purpose' | 'appointment_id' | 'lastCall'> & { id: string }
      const items: Omit<QueueItem, 'lastCall'>[] = []
      const push = (rows: unknown[] | null, purpose: Purpose) => {
        for (const r of (rows ?? []) as Row[]) {
          if (!r.patient || r.patient.opt_out || r.patient.dnd) continue
          items.push({ key: `${purpose}:${r.id}`, purpose, appointment_id: r.id, starts_at: r.starts_at, reason: r.reason, patient: r.patient, doctor: r.doctor })
        }
      }
      push(tomorrow.data, 'reminder')
      push(missed.data, 'missed')
      push(visited.data, 'post_visit')

      // Last call to each of these patients in the past 2 days, to show what already happened.
      const ids = [...new Set(items.map((i) => i.patient.id))]
      const calls = ids.length
        ? await sb.from('calls').select('id, patient_id, status, outcome, started_at').in('patient_id', ids).gte('started_at', istDayStart(-1, now).toISOString()).order('started_at', { ascending: false })
        : { data: [], error: null }
      if (calls.error) throw calls.error
      const last = new Map<string, QueueItem['lastCall']>()
      for (const c of (calls.data ?? []) as { id: string; patient_id: string; status: string; outcome: string | null; started_at: string }[]) {
        if (!last.has(c.patient_id)) last.set(c.patient_id, { id: c.id, status: c.status, outcome: c.outcome, started_at: c.started_at })
      }
      return items.map((i) => ({ ...i, lastCall: last.get(i.patient.id) ?? null }))
    },
  })
}

export function useRecentCalls(limit = 50) {
  return useQuery({
    queryKey: ['calls', 'recent', limit],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('calls').select(CALL_SELECT).order('started_at', { ascending: false }).limit(limit)
      if (error) throw error
      return data as unknown as CallRow[]
    },
  })
}

export interface TranscriptTurn {
  id: string
  speaker: 'patient' | 'agent' | 'staff' | 'system'
  text: string
  language: Language | null
  start_ms: number | null
}

export interface CallEventRow {
  id: string
  type: string
  label: string
  at: string
  payload: Record<string, unknown>
}

export function useCallDetail(callId: string | null) {
  return useQuery({
    queryKey: ['call', callId],
    enabled: Boolean(callId),
    refetchInterval: (q) => ((q.state.data as { call?: CallRow } | undefined)?.call?.status === 'live' ? 3000 : false),
    queryFn: async () => {
      const sb = requireSupabase()
      const [call, turns, events] = await Promise.all([
        sb.from('calls').select(CALL_SELECT).eq('id', callId!).single(),
        sb.from('call_transcripts').select('id, speaker, text, language, start_ms').eq('call_id', callId!).order('start_ms').order('created_at'),
        sb.from('call_events').select('id, type, label, at, payload').eq('call_id', callId!).order('at'),
      ])
      const err = call.error ?? turns.error ?? events.error
      if (err) throw err
      return { call: call.data as unknown as CallRow, turns: turns.data as TranscriptTurn[], events: events.data as CallEventRow[] }
    },
  })
}
