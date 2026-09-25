import {
  BookOpen,
  Bot,
  CalendarDays,
  ChartSpline,
  FileAudio,
  LayoutDashboard,
  ListChecks,
  PhoneCall,
  PhoneForwarded,
  Settings,
  Siren,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

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
    label: 'Operations',
    items: [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard, keywords: ['home', 'overview'] },
      { label: 'Live Calls', path: '/live-calls', icon: PhoneCall, keywords: ['active', 'monitor'] },
      { label: 'Agents', path: '/agents', icon: Bot, keywords: ['ai', 'workforce', 'bots'] },
      { label: 'Escalations', path: '/escalations', icon: Siren, keywords: ['alerts', 'urgent'] },
    ],
  },
  {
    label: 'Care',
    items: [
      { label: 'Patients', path: '/patients', icon: Users },
      { label: 'Appointments', path: '/appointments', icon: CalendarDays, keywords: ['booking', 'schedule'] },
      { label: 'Follow-ups', path: '/follow-ups', icon: PhoneForwarded, keywords: ['outbound', 'callbacks'] },
      { label: 'Tasks', path: '/tasks', icon: ListChecks, keywords: ['todo'] },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Call Records', path: '/call-records', icon: FileAudio, keywords: ['history', 'recordings', 'transcripts'] },
      { label: 'Analytics', path: '/analytics', icon: ChartSpline, keywords: ['reports', 'metrics'] },
    ],
  },
  {
    label: 'Configure',
    items: [
      { label: 'Knowledge', path: '/knowledge', icon: BookOpen, keywords: ['faq', 'documents'] },
      { label: 'Workflows', path: '/workflows', icon: Workflow, keywords: ['automation', 'flows'] },
      { label: 'Settings', path: '/settings', icon: Settings, keywords: ['preferences', 'hospital'] },
    ],
  },
]

export const NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items)
