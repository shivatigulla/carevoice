import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Bot, Wrench } from 'lucide-react'

import { PageHeader } from '@/components/layout/page-header'
import { AgentAvatar, EmptyState, ErrorState, LanguageChip, LiveWaveform, SkeletonCard, StatusPill } from '@/components/signature'
import { queryKeys, useAgents, useLiveCalls } from '@/hooks/use-data'
import { useRealtimeInvalidate } from '@/hooks/use-realtime'
import { requireSupabase } from '@/lib/supabase'
import { istDayStart } from '@/lib/time'
import type { AgentRow } from '@/lib/types'

function useCallsTodayByAgent() {
  return useQuery({
    queryKey: ['calls', 'today-by-agent'],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('calls')
        .select('agent_type')
        .gte('started_at', istDayStart(0).toISOString())
        .limit(5000)
      if (error) throw error
      const counts = new Map<string, number>()
      for (const r of data as { agent_type: string | null }[]) if (r.agent_type) counts.set(r.agent_type, (counts.get(r.agent_type) ?? 0) + 1)
      return counts
    },
  })
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div>
      <div className="font-heading text-xl font-semibold tabular">{value ?? '—'}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}

function AgentCard({ agent, live, today, index }: { agent: AgentRow; live: number; today: number | undefined; index: number }) {
  const tools = agent.config.allowed_tools ?? []
  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-soft transition-shadow hover:shadow-lift"
    >
      <div className="flex items-start gap-3.5">
        <AgentAvatar agentKey={agent.type} active={live > 0} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-heading text-base font-semibold">{agent.display_name}</h3>
            {!agent.enabled ? (
              <StatusPill tone="neutral">Paused</StatusPill>
            ) : live > 0 ? (
              <StatusPill tone="live" pulse>
                On {live} call{live > 1 ? 's' : ''}
              </StatusPill>
            ) : (
              <StatusPill tone="ok">Ready</StatusPill>
            )}
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{agent.config.description}</p>
        </div>
      </div>

      <div className="flex items-end justify-between rounded-md bg-muted/50 px-4 py-3">
        <div className="flex gap-6">
          <Stat label="Live now" value={live} />
          <Stat label="Calls today" value={today} />
        </div>
        <LiveWaveform active={live > 0} bars={7} className="h-5" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          <Wrench className="size-3" /> {tools.length} allowed tools
        </div>
        <div className="flex flex-wrap gap-1">
          {tools.map((t) => (
            <code key={t} className="rounded bg-ai/[0.07] px-1.5 py-0.5 font-mono text-[10.5px] text-ai ring-1 ring-ai/15 ring-inset">
              {t}
            </code>
          ))}
        </div>
      </div>

      <div className="mt-auto flex gap-1 border-t pt-3">
        {(agent.config.languages ?? []).map((l) => (
          <LanguageChip key={l} lang={l} showNative={l !== 'en'} />
        ))}
      </div>
    </motion.article>
  )
}

export default function AgentsPage() {
  const agents = useAgents()
  const live = useLiveCalls()
  const today = useCallsTodayByAgent()
  useRealtimeInvalidate('calls', [queryKeys.liveCalls, ['calls', 'today-by-agent']])

  const liveByType = new Map<string, number>()
  for (const c of live.data ?? []) if (c.agent_type) liveByType.set(c.agent_type, (liveByType.get(c.agent_type) ?? 0) + 1)

  return (
    <>
      <PageHeader
        icon={Bot}
        title="Agents"
        description="Each agent is a configuration — a prompt, the tools it may use and its call flow — running inside one voice session per call."
      />
      {agents.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i} lines={4} />
          ))}
        </div>
      ) : agents.isError ? (
        <div className="rounded-lg border bg-card">
          <ErrorState error={agents.error} onRetry={() => agents.refetch()} />
        </div>
      ) : !agents.data?.length ? (
        <div className="rounded-lg border border-dashed bg-card/50">
          <EmptyState icon={Bot} title="No agents configured" description="Run npm run db:seed to create the six agent configurations." />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.data.map((a, i) => (
            <AgentCard key={a.id} agent={a} index={i} live={liveByType.get(a.type) ?? 0} today={today.data?.get(a.type) ?? (today.data ? 0 : undefined)} />
          ))}
        </div>
      )}
    </>
  )
}
