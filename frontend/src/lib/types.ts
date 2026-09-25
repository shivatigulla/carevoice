/** Row shapes as read by the UI (subsets of columns; the SQL in supabase/migrations is the source of truth). */
import type { AgentKey, Language } from '@/lib/agents'

export type StaffRole = 'admin' | 'reception' | 'doctor' | 'viewer'
export type CallStatus = 'live' | 'completed' | 'failed' | 'no_answer'
export type Priority = 'low' | 'medium' | 'high' | 'critical'
export type AppointmentStatus = 'booked' | 'confirmed' | 'rescheduled' | 'cancelled' | 'checked_in' | 'no_show' | 'completed'
export type SlotStatus = 'open' | 'held' | 'booked' | 'blocked'

export interface Membership {
  role: StaffRole
  full_name: string | null
  tenant: { id: string; name: string; city: string | null } | null
}

export interface AgentConfig {
  description?: string
  prompt?: string
  allowed_tools?: string[]
  languages?: Language[]
}

export interface AgentRow {
  id: string
  type: AgentKey
  display_name: string
  enabled: boolean
  config: AgentConfig
}

export interface LiveCallRow {
  id: string
  direction: 'inbound' | 'outbound'
  channel: 'phone' | 'web'
  agent_type: AgentKey | null
  status: CallStatus
  languages: Language[]
  intent: string | null
  current_stage: string | null
  from_number: string | null
  to_number: string | null
  started_at: string
  patient: { name: string } | null
}

export interface EscalationRow {
  id: string
  priority: Priority
  category: string
  reason: string
  status: 'open' | 'in_progress' | 'resolved'
  call_id: string | null
  created_at: string
  patient: { name: string } | null
}

export interface Department {
  id: string
  name: string
  name_te: string | null
  name_hi: string | null
}

export interface DaySchedule {
  start: string
  end: string
  lunch_start?: string
  lunch_end?: string
}

export type WeekSchedule = Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', DaySchedule | null>>

export interface DoctorRow {
  id: string
  name: string
  name_te: string | null
  name_hi: string | null
  qualification: string | null
  languages_spoken: Language[]
  fee: number | null
  schedule: WeekSchedule
  slot_minutes: number
  is_active: boolean
  department: Department | null
}

export interface PatientRow {
  id: string
  mrn: string | null
  name: string
  phone: string
  dob: string | null
  gender: 'female' | 'male' | 'other' | null
  preferred_language: Language
  caregiver_name: string | null
  caregiver_phone: string | null
  opt_out: boolean
  dnd: boolean
  notes: string | null
  created_at: string
}

export interface AppointmentRow {
  id: string
  status: AppointmentStatus
  source: string
  reason: string | null
  starts_at: string
  checked_in_at: string | null
  patient_id: string
  doctor_id: string
  patient: { id: string; name: string; phone: string; preferred_language: Language } | null
  doctor: { id: string; name: string; department: { name: string } | null } | null
  slot: { ends_at: string } | null
}

export interface SlotRow {
  doctor_id: string
  starts_at: string
  ends_at: string
  status: SlotStatus
}

export interface CallHistoryRow {
  id: string
  direction: 'inbound' | 'outbound'
  channel: 'phone' | 'web'
  agent_type: AgentKey | null
  status: CallStatus
  intent: string | null
  outcome: string | null
  languages: Language[]
  started_at: string
  duration_sec: number | null
}
