import { useMutation } from '@tanstack/react-query'
import { CalendarDays, HeartHandshake, Loader2, MessageSquareText, PhoneCall, PhoneIncoming, PhoneOff, PhoneOutgoing, UserX } from 'lucide-react'
import { toast } from 'sonner'
import { useState, type ReactNode } from 'react'

import { PersonAvatar } from '@/components/common/person-avatar'
import { EmptyState, ErrorState, LanguageChip, SkeletonCard, StatusPill, TimelineItem } from '@/components/signature'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { apiErrorMessage, startOutboundCall } from '@/lib/api'
import { usePatientAppointments, usePatientCalls } from '@/hooks/use-data'
import { useRealtimeInvalidate } from '@/hooks/use-realtime'
import { AGENT_LABEL } from '@/lib/agents'
import { APPOINTMENT_STATUS } from '@/lib/status'
import { ageFromDob, formatDateTime, formatDuration, formatLongDate, formatPhone, formatRelative } from '@/lib/time'
import type { AppointmentRow, PatientRow } from '@/lib/types'

const LANGUAGE_NAME = { te: 'Telugu', hi: 'Hindi', en: 'English' } as const

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm">{children}</dd>
    </div>
  )
}

function AppointmentItem({ a }: { a: AppointmentRow }) {
  const s = APPOINTMENT_STATUS[a.status]
  return (
    <li className="flex items-start gap-3 rounded-md border bg-background/60 px-3 py-2.5">
      <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{formatDateTime(a.starts_at)}</span>
          <StatusPill tone={s.tone}>{s.label}</StatusPill>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {a.doctor?.name}
          {a.doctor?.department && ` · ${a.doctor.department.name}`}
        </div>
        {a.reason && <div className="mt-0.5 truncate text-xs">{a.reason}</div>}
      </div>
    </li>
  )
}

function Appointments({ patientId }: { patientId: string }) {
  const q = usePatientAppointments(patientId)
  const [now] = useState(() => Date.now())
  if (q.isLoading) return <SkeletonCard bare avatar={false} lines={2} />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const rows = q.data ?? []
  if (!rows.length) return <EmptyState compact icon={CalendarDays} title="No appointments" description="Appointments booked by agents or staff will show here." />
  const upcoming = rows.filter((a) => new Date(a.starts_at).getTime() >= now).reverse()
  const past = rows.filter((a) => new Date(a.starts_at).getTime() < now)
  return (
    <div className="space-y-3">
      {upcoming.length > 0 && <ul className="space-y-2">{upcoming.map((a) => <AppointmentItem key={a.id} a={a} />)}</ul>}
      {past.length > 0 && (
        <>
          <div className="text-xs text-muted-foreground">Past</div>
          <ul className="space-y-2 opacity-80">{past.map((a) => <AppointmentItem key={a.id} a={a} />)}</ul>
        </>
      )}
    </div>
  )
}

function Timeline({ patientId }: { patientId: string }) {
  const q = usePatientCalls(patientId)
  if (q.isLoading) return <SkeletonCard bare lines={1} />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const calls = q.data ?? []
  if (!calls.length) {
    return <EmptyState compact icon={MessageSquareText} title="No calls yet" description="Every call with this patient — inbound or outbound — will appear here with its outcome." />
  }
  return (
    <ol>
      {calls.map((c, i) => (
        <TimelineItem
          key={c.id}
          icon={c.direction === 'inbound' ? PhoneIncoming : PhoneOutgoing}
          tone={c.status === 'live' ? 'live' : c.status === 'completed' ? 'ai' : 'neutral'}
          last={i === calls.length - 1}
          title={`${c.direction === 'inbound' ? 'Inbound' : 'Outbound'} call${c.agent_type ? ` · ${AGENT_LABEL[c.agent_type]}` : ''}`}
          time={formatRelative(c.started_at)}
          description={[c.intent, c.outcome, c.duration_sec ? formatDuration(c.duration_sec) : null].filter(Boolean).join(' · ') || undefined}
        >
          {c.languages.length > 0 && (
            <div className="mt-1.5 flex gap-1">
              {c.languages.map((l) => (
                <LanguageChip key={l} lang={l} />
              ))}
            </div>
          )}
        </TimelineItem>
      ))}
    </ol>
  )
}

function CallNowButton({ patient }: { patient: PatientRow }) {
  const m = useMutation({
    mutationFn: () => startOutboundCall({ patient_id: patient.id, purpose: 'reminder' }),
    onSuccess: () => toast.success(`Calling ${patient.name}…`),
    onError: (e) => toast.error(`Couldn't place the call: ${apiErrorMessage(e)}`),
  })
  const blocked = patient.opt_out || patient.dnd
  return (
    <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending || blocked} title={blocked ? 'Patient opted out / DND' : undefined}>
      {m.isPending ? <Loader2 className="animate-spin" /> : <PhoneCall />} Call now
    </Button>
  )
}

export function PatientDrawer({ patient, onClose }: { patient: PatientRow | null; onClose: () => void }) {
  useRealtimeInvalidate('appointments', [['appointments', 'patient']])
  useRealtimeInvalidate('calls', [['calls', 'patient']])
  const age = patient ? ageFromDob(patient.dob) : null

  return (
    <Sheet open={Boolean(patient)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[520px]">
        {patient && (
          <>
            <div className="border-b bg-card px-6 pt-6 pb-5">
              <div className="flex items-start gap-4 pr-8">
                <PersonAvatar name={patient.name} size="lg" />
                <div className="min-w-0 space-y-1.5">
                  <SheetTitle className="font-heading text-xl font-bold tracking-tight">{patient.name}</SheetTitle>
                  <SheetDescription className="flex flex-wrap items-center gap-2 text-xs">
                    {patient.mrn && <span className="font-mono">{patient.mrn}</span>}
                    {age !== null && <span>{age} years</span>}
                    {patient.gender && <span className="capitalize">{patient.gender}</span>}
                  </SheetDescription>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <LanguageChip lang={patient.preferred_language} showNative />
                    {patient.opt_out && (
                      <StatusPill tone="critical">
                        <UserX className="size-3" /> Opted out
                      </StatusPill>
                    )}
                    {patient.dnd && (
                      <StatusPill tone="warning">
                        <PhoneOff className="size-3" /> DND
                      </StatusPill>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-7 px-6 py-6">
              <div className="-mt-2">
                <CallNowButton patient={patient} />
              </div>

              <Section title="Profile">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <Field label="Phone">
                    <span className="font-mono tabular">{formatPhone(patient.phone)}</span>
                  </Field>
                  <Field label="Preferred language">{LANGUAGE_NAME[patient.preferred_language]}</Field>
                  <Field label="Date of birth">{patient.dob ? formatLongDate(`${patient.dob}T12:00:00Z`) : '—'}</Field>
                  <Field label="Registered">{formatLongDate(patient.created_at)}</Field>
                </dl>
                {patient.notes && <p className="rounded-md bg-muted/60 px-3 py-2 text-[13px] text-muted-foreground">{patient.notes}</p>}
              </Section>

              <Section title="Caregiver">
                {patient.caregiver_name ? (
                  <div className="flex items-center gap-3 rounded-md border bg-background/60 px-3 py-2.5">
                    <HeartHandshake className="size-4 text-primary dark:text-accent-foreground" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{patient.caregiver_name}</div>
                      {patient.caregiver_phone && <div className="font-mono text-xs text-muted-foreground">{formatPhone(patient.caregiver_phone)}</div>}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No caregiver on file.</p>
                )}
              </Section>

              <Section title="Appointments">
                <Appointments patientId={patient.id} />
              </Section>

              <Section title="Communication">
                <Timeline patientId={patient.id} />
              </Section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
