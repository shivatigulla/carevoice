import { motion } from 'framer-motion'
import { Bot } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Panel } from '@/components/dashboard/panel'
import { AgentAvatar, EmptyState, ErrorState, LanguageChip, LiveWaveform, SkeletonCard, StatusPill } from '@/components/signature'
import { Button } from '@/components/ui/button'
import { useAgents, useLiveCalls } from '@/hooks/use-data'
import type { AgentRow } from '@/lib/types'

function AgentCard({ agent, activeCalls, index }: { agent: AgentRow; activeCalls: number; index: number }) {
  const onCall = activeCalls > 0
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="group flex flex-col gap-3 rounded-lg border bg-card p-4 transition-shadow hover:shadow-lift"
    >
      <div className="flex items-start gap-3">
        <AgentAvatar agentKey={agent.key} active={onCall} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate font-heading text-sm font-semibold">{agent.name}</h3>
            {agent.status !== 'active' ? (
              <StatusPill tone="neutral" className="capitalize">
                {agent.status}
              </StatusPill>
            ) : onCall ? (
              <StatusPill tone="live" pulse>
                On {activeCalls} call{activeCalls > 1 ? 's' : ''}
              </StatusPill>
            ) : (
              <StatusPill tone="ok">Ready</StatusPill>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{agent.description}</p>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between">
        <div className="flex gap-1">
          {agent.languages.map((l) => (
            <LanguageChip key={l} lang={l} />
          ))}
        </div>
        <LiveWaveform active={onCall} bars={6} className="h-3.5" />
      </div>
    </motion.div>
  )
}

export function AiWorkforce() {
  const agents = useAgents()
  const live = useLiveCalls()

  const callsByAgent = new Map<string, number>()
  for (const c of live.data ?? []) {
    if (c.agent_id) callsByAgent.set(c.agent_id, (callsByAgent.get(c.agent_id) ?? 0) + 1)
  }

  const onCallCount = agents.data?.filter((a) => callsByAgent.has(a.id)).length ?? 0

  return (
    <Panel
      title="AI Workforce"
      description={agents.data?.length ? `${onCallCount} of ${agents.data.length} agents on calls` : 'Voice agents for this hospital'}
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/agents">Manage</Link>
        </Button>
      }
      bodyClassName="p-4"
    >
      {agents.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </div>
      ) : agents.isError ? (
        <ErrorState error={agents.error} onRetry={() => agents.refetch()} />
      ) : !agents.data?.length ? (
        <EmptyState
          compact
          icon={Bot}
          title="No agents configured"
          description="Run npm run db:seed to create the Reception, Appointment, Follow-up, Pre-Visit, Caring and Console agents."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.data.map((a, i) => (
            <AgentCard key={a.id} agent={a} index={i} activeCalls={callsByAgent.get(a.id) ?? 0} />
          ))}
        </div>
      )}
    </Panel>
  )
}
