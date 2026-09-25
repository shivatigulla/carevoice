import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

const TONES = {
  primary: 'bg-primary/10 text-primary ring-primary/20 dark:text-accent-foreground',
  live: 'bg-live/15 text-live-foreground ring-live/30 dark:text-live',
  ai: 'bg-ai/10 text-ai ring-ai/20',
  warning: 'bg-warning/15 text-warning-foreground ring-warning/30 dark:text-warning',
  critical: 'bg-critical/10 text-critical ring-critical/25',
  neutral: 'bg-muted text-muted-foreground ring-border',
}

interface TimelineItemProps {
  icon: LucideIcon
  title: ReactNode
  description?: ReactNode
  /** Right-aligned meta, typically a timestamp. */
  time?: ReactNode
  tone?: keyof typeof TONES
  /** Hide the connector line below the last item. */
  last?: boolean
  className?: string
  children?: ReactNode
}

export function TimelineItem({ icon: Icon, title, description, time, tone = 'neutral', last = false, className, children }: TimelineItemProps) {
  return (
    <li className={cn('relative flex gap-3 pb-5 last:pb-0', className)}>
      {!last && <span aria-hidden className="absolute top-8 bottom-0 left-[13px] w-px bg-border" />}
      <span className={cn('relative z-10 inline-flex size-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset', TONES[tone])}>
        <Icon className="size-3.5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-sm font-medium leading-snug">{title}</div>
          {time && <div className="shrink-0 font-mono text-[11px] text-muted-foreground tabular">{time}</div>}
        </div>
        {description && <div className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{description}</div>}
        {children}
      </div>
    </li>
  )
}
