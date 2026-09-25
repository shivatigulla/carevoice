import { AlertTriangle, ShieldCheck, Siren } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Panel } from '@/components/dashboard/panel'
import { EmptyState, ErrorState, SkeletonCard, StatusPill, TimelineItem } from '@/components/signature'
import { Button } from '@/components/ui/button'
import { queryKeys, useOpenEscalations } from '@/hooks/use-data'
import { useRealtimeInvalidate } from '@/hooks/use-realtime'
import { formatRelative } from '@/lib/time'
import type { Priority } from '@/lib/types'

const PRIORITY: Record<Priority, { tone: 'critical' | 'warning' | 'neutral'; label: string }> = {
  critical: { tone: 'critical', label: 'Critical' },
  high: { tone: 'critical', label: 'High' },
  medium: { tone: 'warning', label: 'Medium' },
  low: { tone: 'neutral', label: 'Low' },
}

export function EscalationsPanel({ className }: { className?: string }) {
  const esc = useOpenEscalations()
  useRealtimeInvalidate('escalations', [queryKeys.openEscalations, queryKeys.kpis])
  const count = esc.data?.length ?? 0

  return (
    <Panel
      className={className}
      title="Escalations"
      description={esc.isSuccess ? (count ? `${count} awaiting staff` : 'Handed to a human by an agent') : undefined}
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/escalations">View all</Link>
        </Button>
      }
    >
      {esc.isLoading ? (
        <div className="space-y-4 p-5">
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonCard key={i} bare lines={1} avatar={false} />
          ))}
        </div>
      ) : esc.isError ? (
        <ErrorState error={esc.error} onRetry={() => esc.refetch()} />
      ) : count === 0 ? (
        <EmptyState compact icon={ShieldCheck} title="All clear" description="When an agent hands a call to staff — an emergency, a complaint, a question it can't answer — it lands here." />
      ) : (
        <ol className="p-5">
          {esc.data!.map((e, i) => {
            const sev = PRIORITY[e.priority]
            return (
              <TimelineItem
                key={e.id}
                icon={e.priority === 'critical' || e.priority === 'high' ? Siren : AlertTriangle}
                tone={sev.tone}
                last={i === count - 1}
                title={e.patient?.name ?? 'Unknown patient'}
                time={formatRelative(e.created_at)}
                description={e.reason}
              >
                <div className="mt-1.5 flex gap-1.5">
                  <StatusPill tone={sev.tone} dot={false}>
                    {sev.label}
                  </StatusPill>
                  {e.status === 'in_progress' && <StatusPill tone="ok">In progress</StatusPill>}
                </div>
              </TimelineItem>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}
