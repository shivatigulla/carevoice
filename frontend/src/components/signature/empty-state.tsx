import { motion } from 'framer-motion'
import { CloudOff, RotateCw, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { ConfigError } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  /** Smaller variant for use inside panels. */
  compact?: boolean
  tone?: 'default' | 'error'
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, compact = false, tone = 'default', className }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-16', className)}
    >
      <div className="relative">
        {!compact && (
          <span
            aria-hidden
            className={cn('absolute -inset-3 rounded-2xl opacity-60', tone === 'error' ? 'bg-critical/5' : 'bg-primary/5')}
          />
        )}
        <span
          className={cn(
            'relative inline-flex items-center justify-center rounded-lg border bg-card shadow-soft',
            compact ? 'size-10' : 'size-14',
            tone === 'error' ? 'text-critical' : 'text-primary dark:text-accent-foreground',
          )}
        >
          <Icon className={compact ? 'size-5' : 'size-6'} strokeWidth={1.6} />
        </span>
      </div>
      <div className={cn('max-w-sm space-y-1', !compact && 'mt-2')}>
        <h3 className={cn('font-heading font-semibold', compact ? 'text-sm' : 'text-base')}>{title}</h3>
        {description && <p className={cn('text-muted-foreground', compact ? 'text-xs leading-relaxed' : 'text-sm leading-relaxed')}>{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </motion.div>
  )
}

/** Error variant of EmptyState with a retry button. Config errors explain what to set up instead. */
export function ErrorState({ error, onRetry, compact = true, className }: { error: unknown; onRetry?: () => void; compact?: boolean; className?: string }) {
  const isConfig = error instanceof ConfigError
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <EmptyState
      icon={CloudOff}
      tone="error"
      compact={compact}
      className={className}
      title={isConfig ? 'Not connected yet' : "Couldn't load this"}
      description={message}
      action={
        !isConfig && onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCw /> Retry
          </Button>
        ) : undefined
      }
    />
  )
}
