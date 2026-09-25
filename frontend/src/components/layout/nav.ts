import { Bot, CalendarDays, FileAudio, Radio, Stethoscope, Users, type LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  /** Extra words the command palette matches on. */
  keywords?: string[]
}

export interface NavSection {
  label: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Calls',
    items: [
      { label: 'Call Center', path: '/', icon: Radio, keywords: ['dashboard', 'home', 'follow-up', 'queue'] },
      { label: 'Call Records', path: '/call-records', icon: FileAudio, keywords: ['history', 'recordings', 'transcripts', 'summary'] },
    ],
  },
  {
    label: 'Hospital',
    items: [
      { label: 'Patients', path: '/patients', icon: Users },
      { label: 'Appointments', path: '/appointments', icon: CalendarDays, keywords: ['booking', 'schedule', 'calendar'] },
      { label: 'Doctors', path: '/doctors', icon: Stethoscope, keywords: ['availability', 'departments'] },
    ],
  },
  {
    label: 'AI',
    items: [{ label: 'Agents', path: '/agents', icon: Bot, keywords: ['ai', 'workforce'] }],
  },
]

export const NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items)
