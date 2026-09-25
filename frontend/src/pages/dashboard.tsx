import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CalendarClock, CalendarX2, HeartPulse, Loader2, PhoneCall, PhoneIncoming, PhoneOutgoing, Radio, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { CallDetailDrawer } from '@/components/calls/call-detail-drawer'
import { PersonAvatar } from '@/components/common/person-avatar'
import { Segmented } from '@/components/common/segmented'
import { Panel } from '@/components/dashboard/panel'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, ErrorState, KpiCard, LanguageChip, SkeletonCard, StatusPill } from '@/components/signature'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useFollowUpQueue, useRecentCalls, type Purpose, type QueueItem } from '@/hooks/use-calls'
import { useRealtimeInvalidate } from '@/hooks/use-realtime'
import { callLabel, callTone } from '@/lib/call-status'
import { apiErrorMessage, startOutboundCall } from '@/lib/api'
import { formatDayLabel, formatDuration, formatRelative, formatTime, istDayStart } from '@/lib/time'
import { cn } from '@/lib/utils'

const PURPOSE: Record<Purpose, { label: string; icon: typeof CalendarClock; className: string }> = {
  reminder: { label: 'Appointment reminder', icon: CalendarClock, className: 'bg-ai/10 text-ai ring-ai/20' },
  missed: { label: 'Missed appointment', icon: CalendarX2, className: 'bg-warning/15 text-warning-foreground ring-warning/30 dark:text-warning' },
  post_visit: { label: 'Post-visit follow-up', icon: HeartPulse, className: 'bg-primary/10 text-primary ring-primary/20 dark:text-accent-foreground' },
}

/** Seeded demo patients use +91 555… numbers, which no Indian mobile uses — they can't be dialled. */
const isDemoNumber = (phone: string) => phone.startsWith('+91555')

function QueueRow({ item, onCalled, index }: { item: QueueItem; onCalled: (callId: string) => void; index: number }) {
  const qc = useQueryClient()
  const p = PURPOSE[item.purpose]
  const demo = isDemoNumber(item.patient.phone)
  const call = useMutation({
    mutationFn: () => startOutboundCall({ patient_id: item.patient.id, appointment_id: item.appointment_id, purpose: item.purpose }),
    onSuccess: (r) => {
      toast.success(`Calling ${item.patient.name}…`)
      qc.invalidateQueries({ queryKey: ['followup-queue'] })
      onCalled(r.call_id)
    },
    onError: (e) => toast.error(`Couldn't call ${item.patient.name}: ${apiErrorMessage(e)}`),
  })
  const when = item.purpose === 'reminder' ? `${formatDayLabel(item.starts_at)}, ${formatTime(item.starts_at)}` : formatDayLabel(item.starts_at)
  const live = item.lastCall?.status === 'live'

  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index, 12) * 0.02 }}
      className="flex items-center gap-3 px-5 py-3.5"
    >
      <PersonAvatar name={item.patient.name} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{item.patient.name}</span>
          <LanguageChip lang={item.patient.preferred_language} />
          <span className={cn('inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium ring-1 ring-inset', p.className)}>
            <p.icon className="size-3" /> {p.label}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[13px] text-muted-foreground">
          {item.doctor?.name}
          {item.doctor?.department && ` · ${item.doctor.department.name}`} · {item.purpose === 'missed' ? 'missed on ' : item.purpose === 'post_visit' ? 'visited ' : ''}
          {when}
          {item.reason && ` · ${item.reason}`}
        </div>
      </div>
      {item.lastCall && (
        <StatusPill tone={callTone(item.lastCall as never)} pulse={live} className="hidden sm:inline-flex">
          {live ? 'On call' : item.lastCall.outcome ?? callLabel(item.lastCall as never)} · {formatRelative(item.lastCall.started_at)}
        </StatusPill>
      )}
      {demo ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>
              <Button size="sm" variant="outline" disabled className="pointer-events-none">
                <PhoneCall /> Call
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Demo patient — number is not dialable</TooltipContent>
        </Tooltip>
      ) : (
        <Button size="sm" onClick={() => call.mutate()} disabled={call.isPending || live}>
          {call.isPending ? <Loader2 className="animate-spin" /> : <PhoneCall />} {live ? 'Calling' : 'Call'}
        </Button>
      )}
    </motion.li>
  )
}

export default function DashboardPage() {
  const [filter, setFilter] = useState<'all' | Purpose>('all')
  const [openCall, setOpenCall] = useState<string | null>(null)
  const queue = useFollowUpQueue()
  const calls = useRecentCalls(30)
  useRealtimeInvalidate('calls', [['calls'], ['followup-queue'], ['call']])
  useRealtimeInvalidate('call_transcripts', [['call']])

  const today = useMemo(() => istDayStart(0).getTime(), [])
  const callsToday = (calls.data ?? []).filter((c) => new Date(c.started_at).getTime() >= today)
  const items = (queue.data ?? []).filter((i) => filter === 'all' || i.purpose === filter)
  const count = (p: Purpose) => (queue.data ?? []).filter((i) => i.purpose === p).length

  return (
    <>
      <PageHeader
        icon={Radio}
        title="Call Center"
        description="AI agents call patients from your hospital records — appointment reminders, missed appointments and post-visit follow-ups — and every call comes back with a summary and recording."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard label="Calls today" icon={PhoneCall} value={calls.data ? callsToday.length : undefined} loading={calls.isLoading} error={calls.isError} hint={`${callsToday.filter((c) => c.status === 'live').length} live now`} />
        <KpiCard label="Answered today" icon={ShieldCheck} accent="live" value={calls.data ? callsToday.filter((c) => c.status === 'completed').length : undefined} loading={calls.isLoading} error={calls.isError} hint={`${callsToday.filter((c) => c.status === 'no_answer').length} not answered`} />
        <KpiCard label="Reminders due" icon={CalendarClock} accent="ai" value={queue.data ? count('reminder') : undefined} loading={queue.isLoading} error={queue.isError} hint="Appointments tomorrow" />
        <KpiCard label="Follow-ups due" icon={HeartPulse} accent="warning" value={queue.data ? count('missed') + count('post_visit') : undefined} loading={queue.isLoading} error={queue.isError} hint={queue.data ? `${count('missed')} missed · ${count('post_visit')} post-visit` : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Panel
          className="xl:col-span-3"
          title="Follow-up queue"
          description="Built from hospital records: who to call today, and why"
          actions={
            <Segmented
              label="Filter"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'reminder', label: 'Reminders' },
                { value: 'missed', label: 'Missed' },
                { value: 'post_visit', label: 'Post-visit' },
              ]}
            />
          }
        >
          {queue.isLoading ? (
            <div className="space-y-5 p-5">
              {Array.from({ length: 5 }, (_, i) => (
                <SkeletonCard key={i} bare lines={1} />
              ))}
            </div>
          ) : queue.isError ? (
            <ErrorState error={queue.error} onRetry={() => queue.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState compact icon={ShieldCheck} title="Nobody to call" description="Patients appear here when they have an appointment tomorrow, missed one, or visited recently." />
          ) : (
            <ul className="divide-y">
              {items.map((i, n) => (
                <QueueRow key={i.key} item={i} index={n} onCalled={setOpenCall} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="xl:col-span-2" title="Recent calls" description="Tap a call for its summary, recording and transcript">
          {calls.isLoading ? (
            <div className="space-y-5 p-5">
              {Array.from({ length: 4 }, (_, i) => (
                <SkeletonCard key={i} bare lines={1} />
              ))}
            </div>
          ) : calls.isError ? (
            <ErrorState error={calls.error} onRetry={() => calls.refetch()} />
          ) : !calls.data?.length ? (
            <EmptyState compact icon={PhoneCall} title="No calls yet" description="Press Call on a patient in the queue — the call and its result show up here." />
          ) : (
            <ul className="divide-y">
              {calls.data.slice(0, 12).map((c) => {
                const Dir = c.direction === 'inbound' ? PhoneIncoming : PhoneOutgoing
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => setOpenCall(c.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:bg-accent">
                      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Dir className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{c.patient?.name ?? c.to_number ?? c.from_number ?? 'Unknown'}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {c.intent ?? (c.channel === 'web' ? 'browser test call' : 'call')} · {formatRelative(c.started_at)}
                          {c.duration_sec ? ` · ${formatDuration(c.duration_sec)}` : ''}
                        </div>
                      </div>
                      <StatusPill tone={callTone(c)} pulse={c.status === 'live'}>
                        {callLabel(c)}
                      </StatusPill>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>

      <CallDetailDrawer callId={openCall} onClose={() => setOpenCall(null)} />
    </>
  )
}
