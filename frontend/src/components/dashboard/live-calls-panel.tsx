import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDownLeft, ArrowUpRight, PhoneOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Panel } from '@/components/dashboard/panel'
import { AgentAvatar, EmptyState, ErrorState, LanguageChip, LiveWaveform, SkeletonCard, StatusPill } from '@/components/signature'
import { Button } from '@/components/ui/button'
import { useLiveCalls } from '@/hooks/use-data'
import { formatDuration } from '@/lib/time'
import type { LiveCallRow } from '@/lib/types'

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

function CallRow({ call, now }: { call: LiveCallRow; now: number }) {
  const since = call.answered_at ?? call.started_at ?? call.created_at
  const ringing = call.status === 'ringing'
  const Direction = call.direction === 'inbound' ? ArrowDownLeft : ArrowUpRight
  const counterpart = call.direction === 'inbound' ? call.from_number : call.to_number

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 6 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-3 px-5 py-3"
    >
      <AgentAvatar agentKey={call.agent?.key ?? 'reception'} active={!ringing} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{call.patient?.full_name ?? counterpart ?? 'Unknown caller'}</span>
          {call.language && <LanguageChip lang={call.language} />}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Direction className="size-3" />
          <span className="truncate">
            {call.agent?.name ?? 'Unassigned'} · {call.direction}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {ringing ? (
          <StatusPill tone="warning" pulse>
            Ringing
          </StatusPill>
        ) : (
          <LiveWaveform bars={5} className="h-3.5" />
        )}
        <span className="font-mono text-xs text-muted-foreground tabular">{formatDuration((now - new Date(since).getTime()) / 1000)}</span>
      </div>
    </motion.li>
  )
}

export function LiveCallsPanel({ className }: { className?: string }) {
  const live = useLiveCalls()
  const now = useNow()
  const count = live.data?.length ?? 0

  return (
    <Panel
      className={className}
      title="Live Calls"
      description={live.isSuccess ? (count ? `${count} in progress` : 'Updates in real time') : undefined}
      actions={
        <>
          {count > 0 && (
            <StatusPill tone="live" pulse>
              Live
            </StatusPill>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link to="/live-calls">View all</Link>
          </Button>
        </>
      }
    >
      {live.isLoading ? (
        <div className="space-y-4 p-5">
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonCard key={i} bare lines={1} />
          ))}
        </div>
      ) : live.isError ? (
        <ErrorState error={live.error} onRetry={() => live.refetch()} />
      ) : count === 0 ? (
        <EmptyState compact icon={PhoneOff} title="No calls right now" description="Active calls appear here the moment an agent picks up or dials out." />
      ) : (
        <ul className="divide-y">
          <AnimatePresence initial={false}>
            {live.data!.map((c) => (
              <CallRow key={c.id} call={c} now={now} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Panel>
  )
}
