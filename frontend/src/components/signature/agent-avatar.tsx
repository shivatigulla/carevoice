import { Bot } from 'lucide-react'

import { AGENT_META, type AgentKey } from '@/lib/agents'
import { cn } from '@/lib/utils'

const SIZES = {
  sm: { box: 'size-8 rounded-md', icon: 'size-4' },
  md: { box: 'size-10 rounded-lg', icon: 'size-5' },
  lg: { box: 'size-12 rounded-lg', icon: 'size-6' },
}

interface AgentAvatarProps {
  agentKey: AgentKey | string
  /** On a call right now: shows a pulsing mint ring. */
  active?: boolean
  size?: keyof typeof SIZES
  className?: string
}

export function AgentAvatar({ agentKey, active = false, size = 'md', className }: AgentAvatarProps) {
  const Icon = AGENT_META[agentKey as AgentKey]?.icon ?? Bot
  const s = SIZES[size]
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {active && (
        <>
          <span aria-hidden className={cn('absolute inset-0 animate-live-ring border-2 border-live', s.box)} />
          <span aria-hidden className={cn('absolute -inset-[3px] border-2 border-live/70', s.box, 'rounded-[calc(var(--radius)*0.95)]')} />
        </>
      )}
      <span
        className={cn(
          'relative inline-flex items-center justify-center bg-ai/10 text-ai ring-1 ring-ai/15 ring-inset transition-colors',
          active && 'bg-live/15 text-live-foreground ring-live/30 dark:text-live',
          s.box,
        )}
      >
        <Icon className={s.icon} strokeWidth={1.75} />
      </span>
      {active && <span className="sr-only">On a call</span>}
    </span>
  )
}
