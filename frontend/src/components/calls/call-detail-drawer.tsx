import { FileAudio, Headphones, ListChecks, MessageSquareText, PhoneIncoming, PhoneOutgoing, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'

import { PersonAvatar } from '@/components/common/person-avatar'
import { EmptyState, ErrorState, LanguageChip, LiveWaveform, SkeletonCard, StatusPill, TimelineItem } from '@/components/signature'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useCallDetail } from '@/hooks/use-calls'
import { callLabel, callTone } from '@/lib/call-status'
import { formatDateTime, formatDuration, formatPhone, formatTime } from '@/lib/time'
import { cn } from '@/lib/utils'

function Section({ icon: Icon, title, children }: { icon: typeof Sparkles; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        <Icon className="size-3.5" /> {title}
      </h3>
      {children}
    </section>
  )
}

/** Everything about one call: status, AI summary, recording, transcript, timeline. */
export function CallDetailDrawer({ callId, onClose }: { callId: string | null; onClose: () => void }) {
  const q = useCallDetail(callId)
  const call = q.data?.call
  const turns = q.data?.turns ?? []
  const events = q.data?.events ?? []
  const Dir = call?.direction === 'inbound' ? PhoneIncoming : PhoneOutgoing
  const number = call ? (call.direction === 'outbound' ? call.to_number : call.from_number) : null

  return (
    <Sheet open={Boolean(callId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[540px]">
        {q.isLoading || !call ? (
          <div className="p-6">
            <SheetTitle className="sr-only">Call</SheetTitle>
            <SheetDescription className="sr-only">Loading call</SheetDescription>
            {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <SkeletonCard lines={4} />}
          </div>
        ) : (
          <>
            <div className="border-b bg-card px-6 pt-6 pb-5">
              <div className="flex items-start gap-4 pr-8">
                <PersonAvatar name={call.patient?.name ?? number ?? '?'} size="lg" />
                <div className="min-w-0 space-y-1.5">
                  <SheetTitle className="font-heading text-xl font-bold tracking-tight">{call.patient?.name ?? (number ? formatPhone(number) : 'Unknown caller')}</SheetTitle>
                  <SheetDescription className="flex flex-wrap items-center gap-x-2 text-xs">
                    <Dir className="size-3.5" />
                    <span className="capitalize">{call.direction}</span>
                    {call.intent && <span>· {call.intent}</span>}
                    <span>· {formatDateTime(call.started_at)}</span>
                  </SheetDescription>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <StatusPill tone={callTone(call)} pulse={call.status === 'live'}>
                      {callLabel(call)}
                    </StatusPill>
                    {call.status === 'live' && <LiveWaveform bars={6} />}
                    {call.duration_sec !== null && <span className="font-mono text-xs text-muted-foreground tabular">{formatDuration(call.duration_sec)}</span>}
                    {call.outcome && <StatusPill tone="ai" dot={false}>{call.outcome.replace('_', ' ')}</StatusPill>}
                    {call.languages.map((l) => (
                      <LanguageChip key={l} lang={l} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-7 px-6 py-6">
              <Section icon={Sparkles} title="AI summary">
                {call.summary?.summary_en ? (
                  <p className="rounded-lg border border-ai/25 bg-ai/[0.05] px-4 py-3 text-[14px] leading-relaxed">{call.summary.summary_en}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {call.status === 'live' ? 'The summary is written when the call ends.' : 'No summary for this call.'}
                  </p>
                )}
              </Section>

              <Section icon={Headphones} title="Recording">
                {call.recording_path ? (
                  <audio controls preload="none" src={call.recording_path} className="w-full">
                    <track kind="captions" />
                  </audio>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {call.status === 'live' ? 'Available when the call ends.' : 'No recording for this call.'}
                  </p>
                )}
              </Section>

              <Section icon={MessageSquareText} title="Transcript">
                {turns.length === 0 ? (
                  <EmptyState compact icon={FileAudio} title={call.status === 'live' ? 'Call in progress' : 'No conversation'} description={call.status === 'live' ? 'The transcript appears when the call ends.' : 'Nothing was said on this call.'} />
                ) : (
                  <div className="space-y-2.5">
                    {turns.map((t) => (
                      <div key={t.id} className={cn('flex', t.speaker === 'patient' ? 'justify-end' : 'justify-start')}>
                        <div
                          className={cn(
                            'max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed',
                            t.speaker === 'patient' ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border bg-card',
                          )}
                        >
                          <div className={cn('mb-0.5 text-[10px] font-semibold tracking-wider uppercase', t.speaker === 'patient' ? 'text-primary-foreground/70' : 'text-ai')}>
                            {t.speaker === 'patient' ? 'Patient' : 'CareVoice agent'}
                          </div>
                          <p lang={t.language ?? undefined}>{t.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section icon={ListChecks} title="Timeline">
                <ol>
                  {events.map((e, i) => (
                    <TimelineItem
                      key={e.id}
                      icon={e.type === 'tool_call' ? Sparkles : Dir}
                      tone={e.type === 'tool_call' ? 'ai' : /fail|answer/i.test(e.label) ? 'warning' : 'neutral'}
                      title={e.label}
                      time={formatTime(e.at)}
                      last={i === events.length - 1}
                      description={typeof e.payload?.error === 'string' ? e.payload.error : undefined}
                    />
                  ))}
                </ol>
              </Section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
