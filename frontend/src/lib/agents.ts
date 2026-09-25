import {
  CalendarCheck2,
  ClipboardList,
  HeartHandshake,
  Headset,
  PhoneOutgoing,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react'

/** The six agent roles. Agents are configurations (prompt + tools + flow) stored per tenant in `agents`. */
export type AgentKey = 'reception' | 'appointment' | 'follow_up' | 'pre_visit' | 'caring' | 'console'

export const AGENT_META: Record<AgentKey, { icon: LucideIcon; order: number }> = {
  reception: { icon: Headset, order: 0 },
  appointment: { icon: CalendarCheck2, order: 1 },
  follow_up: { icon: PhoneOutgoing, order: 2 },
  pre_visit: { icon: ClipboardList, order: 3 },
  caring: { icon: HeartHandshake, order: 4 },
  console: { icon: SquareTerminal, order: 5 },
}

export const AGENT_LABEL: Record<AgentKey, string> = {
  reception: 'Reception',
  appointment: 'Appointment',
  follow_up: 'Follow-up',
  pre_visit: 'Pre-Visit',
  caring: 'Caring',
  console: 'Console',
}

export type Language = 'te' | 'hi' | 'en'
