import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

export type StatusTone = 'live' | 'ok' | 'ai' | 'warning' | 'critical' | 'neutral'

const TONES: Record<StatusTone, { pill: string; dot: string }> = {
  live: { pill: 'bg-live/12 text-live-foreground ring-live/30 dark:text-live', dot: 'bg-live' },
  ok: { pill: 'bg-primary/8 text-primary ring-primary/20 dark:text-accent-foreground', dot: 'bg-primary' },
  ai: { pill: 'bg-ai/10 text-ai ring-ai/20', dot: 'bg-ai' },
  warning: { pill: 'bg-warning/15 text-warning-foreground ring-warning/30 dark:text-warning', dot: 'bg-warning' },
  critical: { pill: 'bg-critical/10 text-critical ring-critical/25', dot: 'bg-critical' },
  neutral: { pill: 'bg-muted text-muted-foreground ring-border', dot: 'bg-muted-foreground/60' },
}

interface StatusPillProps extends ComponentProps<'span'> {
  tone?: StatusTone
  /** Animate the dot (something is happening right now). */
  pulse?: boolean
  dot?: boolean
}

export function StatusPill({ tone = 'neutral', pulse = false, dot = true, className, children, ...props }: StatusPillProps) {
  const t = TONES[tone]
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        t.pill,
        className,
      )}
      {...props}
    >
      {dot && (
        <span className="relative inline-flex size-1.5">
          {pulse && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-75', t.dot)} />}
          <span className={cn('relative inline-flex size-1.5 rounded-full', t.dot)} />
        </span>
      )}
      {children}
    </span>
  )
}
