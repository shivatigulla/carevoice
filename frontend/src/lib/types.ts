/** Row shapes as read by the dashboard (subset of columns; see supabase/migrations). */
import type { AgentKey, Language } from '@/lib/agents'

export type CallStatus = 'queued' | 'ringing' | 'in_progress' | 'completed' | 'failed' | 'no_answer' | 'busy' | 'transferred'
export type Severity = 'low' | 'medium' | 'high' | 'critical'

export interface AgentRow {
  id: string
  key: AgentKey
  name: string
  description: string | null
  status: 'active' | 'paused' | 'draft'
  languages: Language[]
}

export interface LiveCallRow {
  id: string
  agent_id: string | null
  status: CallStatus
  direction: 'inbound' | 'outbound'
  language: Language | null
  from_number: string | null
  to_number: string | null
  started_at: string | null
  answered_at: string | null
  created_at: string
  agent: { key: AgentKey; name: string } | null
  patient: { full_name: string } | null
}

export interface EscalationRow {
  id: string
  severity: Severity
  reason: string
  status: 'open' | 'acknowledged' | 'resolved'
  call_id: string | null
  created_at: string
  patient: { full_name: string } | null
}

export interface TenantMembership {
  role: 'admin' | 'staff' | 'viewer'
  full_name: string | null
  tenant: { id: string; name: string } | null
}
