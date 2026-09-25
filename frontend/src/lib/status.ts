import type { StatusTone } from '@/components/signature'
import type { AppointmentStatus, SlotStatus } from '@/lib/types'

export const APPOINTMENT_STATUS: Record<AppointmentStatus, { label: string; tone: StatusTone; block: string }> = {
  booked: { label: 'Booked', tone: 'ok', block: 'border-primary/40 bg-primary/10 text-primary dark:text-accent-foreground' },
  confirmed: { label: 'Confirmed', tone: 'ai', block: 'border-ai/40 bg-ai/10 text-ai' },
  checked_in: { label: 'Arrived', tone: 'live', block: 'border-live/50 bg-live/15 text-live-foreground dark:text-live' },
  completed: { label: 'Completed', tone: 'neutral', block: 'border-border bg-muted text-muted-foreground' },
  no_show: { label: 'No-show', tone: 'critical', block: 'border-critical/40 bg-critical/10 text-critical' },
  cancelled: { label: 'Cancelled', tone: 'neutral', block: 'border-dashed border-border bg-transparent text-muted-foreground line-through' },
  rescheduled: { label: 'Rescheduled', tone: 'warning', block: 'border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning' },
}

export const SLOT_STATUS: Record<SlotStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-primary/25 dark:bg-primary/40' },
  held: { label: 'Held', className: 'bg-warning/70' },
  booked: { label: 'Booked', className: 'bg-ai/70' },
  blocked: { label: 'Blocked', className: 'bg-muted-foreground/30' },
}

export const CAN_CHECK_IN: AppointmentStatus[] = ['booked', 'confirmed']
