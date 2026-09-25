import { motion } from 'framer-motion'
import { Check, Loader2, ShieldQuestion, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ConfirmationState = 'pending' | 'approving' | 'approved' | 'cancelled' | 'failed'

interface ConfirmationCardProps {
  /** The write about to happen, e.g. "Reschedule 3 appointments". */
  title: string
  description?: ReactNode
  details?: { label: string; value: ReactNode }[]
  state: ConfirmationState
  onApprove?: () => void
  onCancel?: () => void
  /** Shown when state is `failed`. */
  error?: string
  className?: string
}

/** Nothing executes without Approve: every staff-console write renders as one of these first. */
export function ConfirmationCard({ title, description, details, state, onApprove, onCancel, error, className }: ConfirmationCardProps) {
  const settled = state === 'approved' || state === 'cancelled'
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'rounded-lg border bg-card shadow-soft transition-colors',
        state === 'approved' && 'border-live/40',
        state === 'cancelled' && 'opacity-70',
        state === 'failed' && 'border-critical/40',
        className,
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-warning/15 text-warning-foreground dark:text-warning">
          <ShieldQuestion className="size-4" strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Needs your approval</p>
          <h4 className="font-heading text-[15px] font-semibold">{title}</h4>
          {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
        </div>
      </div>
      {details && details.length > 0 && (
        <dl className="mx-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md bg-muted/60 px-3 py-2.5 text-[13px]">
          {details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd className="min-w-0">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {state === 'failed' && error && <p className="mx-4 mt-3 text-[13px] text-critical">{error}</p>}
      <div className="flex items-center justify-end gap-2 p-4">
        {settled ? (
          <span className={cn('inline-flex items-center gap-1.5 text-[13px] font-medium', state === 'approved' ? 'text-live-foreground dark:text-live' : 'text-muted-foreground')}>
            {state === 'approved' ? <Check className="size-4" /> : <X className="size-4" />}
            {state === 'approved' ? 'Approved and done' : 'Cancelled — nothing changed'}
          </span>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={state === 'approving'}>
              Cancel
            </Button>
            <Button size="sm" onClick={onApprove} disabled={state === 'approving'}>
              {state === 'approving' ? <Loader2 className="animate-spin" /> : <Check />}
              {state === 'failed' ? 'Try again' : 'Approve'}
            </Button>
          </>
        )}
      </div>
    </motion.div>
  )
}
