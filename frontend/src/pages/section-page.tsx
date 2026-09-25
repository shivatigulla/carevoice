import {
  BookOpen,
  Bot,
  CalendarDays,
  ChartSpline,
  FileAudio,
  ListChecks,
  PhoneCall,
  PhoneForwarded,
  Settings,
  Siren,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/signature'

interface SectionConfig {
  title: string
  description: string
  icon: LucideIcon
  empty: { title: string; description: string; icon?: LucideIcon }
}

const SECTIONS = {
  liveCalls: {
    title: 'Live Calls',
    description: 'Every call your agents are on right now, with live transcripts in Telugu, Hindi and English.',
    icon: PhoneCall,
    empty: { title: 'No live calls', description: 'When an agent answers or dials out, the call and its transcript stream in here in real time.' },
  },
  agents: {
    title: 'Agents',
    description: 'Configure each voice agent’s prompt, allowed tools, languages and call flow.',
    icon: Bot,
    empty: { title: 'Agent configuration is on its way', description: 'For now, agents are seeded with npm run db:seed and shown on the Dashboard’s AI Workforce.' },
  },
  patients: {
    title: 'Patients',
    description: 'Everyone who has spoken with your hospital, with their preferred language and history.',
    icon: Users,
    empty: { title: 'No patients yet', description: 'Patients are added when they call in, book through an agent, or are imported by staff.' },
  },
  appointments: {
    title: 'Appointments',
    description: 'Bookings made by agents and staff, checked against real doctor availability.',
    icon: CalendarDays,
    empty: { title: 'No appointments yet', description: 'Appointments booked by the Appointment agent will appear here with the call that created them.' },
  },
  followUps: {
    title: 'Follow-ups',
    description: 'Outbound calls scheduled after visits — recovery checks, reminders and review bookings.',
    icon: PhoneForwarded,
    empty: { title: 'No follow-ups scheduled', description: 'Follow-up calls are queued here and placed automatically by the Follow-up agent when they fall due.' },
  },
  tasks: {
    title: 'Tasks',
    description: 'Work agents hand to your staff: callbacks, record updates, anything that needs a person.',
    icon: ListChecks,
    empty: { title: 'No open tasks', description: 'When a call ends with something for staff to do, the agent creates a task here.' },
  },
  escalations: {
    title: 'Escalations',
    description: 'Calls agents handed to a human — emergencies, complaints and questions they must not answer.',
    icon: Siren,
    empty: { title: 'No escalations', description: 'Escalated calls appear here instantly, ranked by severity, with the transcript attached.' },
  },
  callRecords: {
    title: 'Call Records',
    description: 'Searchable history of every call with recordings, transcripts and AI summaries.',
    icon: FileAudio,
    empty: { title: 'No calls recorded yet', description: 'Completed calls are stored here with their recording, transcript and summary.' },
  },
  analytics: {
    title: 'Analytics',
    description: 'Call volume, resolution, languages and booking conversion over time.',
    icon: ChartSpline,
    empty: { title: 'Not enough data yet', description: 'Charts fill in once your agents have handled real calls.' },
  },
  knowledge: {
    title: 'Knowledge',
    description: 'Hospital-approved answers agents may use: timings, departments, preparation instructions.',
    icon: BookOpen,
    empty: { title: 'No knowledge added', description: 'Agents only share information that is added here — they never invent policies or instructions.' },
  },
  workflows: {
    title: 'Workflows',
    description: 'Automations that connect calls to follow-ups, reminders and staff tasks.',
    icon: Workflow,
    empty: { title: 'No workflows yet', description: 'Workflows will let you define what happens after each kind of call.' },
  },
  settings: {
    title: 'Settings',
    description: 'Hospital profile, phone numbers, languages, voices and team access.',
    icon: Settings,
    empty: { title: 'Settings are coming together', description: 'Hospital, telephony and team settings will be managed here.' },
  },
} satisfies Record<string, SectionConfig>

export function SectionPage({ section }: { section: keyof typeof SECTIONS }) {
  const s: SectionConfig = SECTIONS[section]
  return (
    <>
      <PageHeader icon={s.icon} title={s.title} description={s.description} />
      <div className="rounded-lg border border-dashed bg-card/50">
        <EmptyState icon={s.empty.icon ?? s.icon} title={s.empty.title} description={s.empty.description} />
      </div>
    </>
  )
}
