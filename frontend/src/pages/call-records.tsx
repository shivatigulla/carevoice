import { FileAudio, Headphones, PhoneIncoming, PhoneOutgoing, Sparkles } from 'lucide-react'
import { useState } from 'react'

import { CallDetailDrawer } from '@/components/calls/call-detail-drawer'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, ErrorState, LanguageChip, SkeletonCard, StatusPill } from '@/components/signature'
import { useRecentCalls } from '@/hooks/use-calls'
import { useRealtimeInvalidate } from '@/hooks/use-realtime'
import { callLabel, callTone } from '@/lib/call-status'
import { formatDateTime, formatDuration, formatPhone } from '@/lib/time'

export default function CallRecordsPage() {
  const calls = useRecentCalls(200)
  const [open, setOpen] = useState<string | null>(null)
  useRealtimeInvalidate('calls', [['calls'], ['call']])

  return (
    <>
      <PageHeader icon={FileAudio} title="Call Records" description="Every call with its outcome, AI summary, recording and transcript." />
      <div className="overflow-hidden rounded-lg border bg-card shadow-soft">
        {calls.isLoading ? (
          <div className="space-y-5 p-5">
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonCard key={i} bare lines={1} />
            ))}
          </div>
        ) : calls.isError ? (
          <ErrorState error={calls.error} onRetry={() => calls.refetch()} />
        ) : !calls.data?.length ? (
          <EmptyState icon={FileAudio} title="No calls yet" description="Calls placed from the Call Center appear here with their summary and recording." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">When</th>
                  <th className="px-3 py-2.5 font-medium">Patient</th>
                  <th className="hidden px-3 py-2.5 font-medium md:table-cell">Purpose</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Summary</th>
                  <th className="px-5 py-2.5 text-right font-medium">Length</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {calls.data.map((c) => {
                  const Dir = c.direction === 'inbound' ? PhoneIncoming : PhoneOutgoing
                  const number = c.direction === 'outbound' ? c.to_number : c.from_number
                  return (
                    <tr key={c.id} onClick={() => setOpen(c.id)} className="cursor-pointer transition-colors hover:bg-muted/40">
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <Dir className="size-3.5 text-muted-foreground" />
                          <span className="font-mono text-[12.5px] tabular">{formatDateTime(c.started_at)}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium">{c.patient?.name ?? (number ? formatPhone(number) : '—')}</div>
                        <div className="flex gap-1 pt-0.5">
                          {c.languages.map((l) => (
                            <LanguageChip key={l} lang={l} />
                          ))}
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">{c.intent ?? (c.channel === 'web' ? 'browser test call' : '—')}</td>
                      <td className="px-3 py-3">
                        <StatusPill tone={callTone(c)} pulse={c.status === 'live'}>
                          {callLabel(c)}
                        </StatusPill>
                      </td>
                      <td className="hidden max-w-[320px] px-3 py-3 lg:table-cell">
                        <div className="flex items-center gap-2">
                          {c.summary?.summary_en ? (
                            <>
                              <Sparkles className="size-3.5 shrink-0 text-ai" />
                              <span className="truncate text-muted-foreground">{c.summary.summary_en}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                          {c.recording_path && <Headphones className="size-3.5 shrink-0 text-primary" aria-label="Has recording" />}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-[12.5px] text-muted-foreground tabular">{c.duration_sec ? formatDuration(c.duration_sec) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <CallDetailDrawer callId={open} onClose={() => setOpen(null)} />
    </>
  )
}
