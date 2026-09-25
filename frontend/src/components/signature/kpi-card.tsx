import { animate, motion, useReducedMotion } from 'framer-motion'
import { AlertCircle, ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export interface KpiTrend {
  /** Absolute change vs the comparison period. */
  delta: number
  label: string
  /** For metrics where going down is good (e.g. escalations). */
  invert?: boolean
}

interface KpiCardProps {
  label: string
  value: number | undefined
  icon: LucideIcon
  loading?: boolean
  error?: boolean
  trend?: KpiTrend
  hint?: string
  accent?: 'primary' | 'live' | 'ai' | 'warning' | 'critical'
  className?: string
}

const ACCENTS = {
  primary: 'bg-primary/10 text-primary dark:text-accent-foreground',
  live: 'bg-live/15 text-live-foreground dark:text-live',
  ai: 'bg-ai/10 text-ai',
  warning: 'bg-warning/15 text-warning-foreground dark:text-warning',
  critical: 'bg-critical/10 text-critical',
}

function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (reduce) return
    const controls = animate(from.current, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    from.current = value
    return () => controls.stop()
  }, [value, reduce])
  return <>{(reduce ? value : display).toLocaleString('en-IN')}</>
}

function Trend({ trend }: { trend: KpiTrend }) {
  const { delta, label, invert } = trend
  const good = invert ? delta < 0 : delta > 0
  const Icon = delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded-md px-1 py-px font-medium tabular',
          delta === 0 ? 'bg-muted' : good ? 'bg-live/15 text-live-foreground dark:text-live' : 'bg-critical/10 text-critical',
        )}
      >
        <Icon className="size-3" strokeWidth={2.25} />
        {delta > 0 ? `+${delta}` : delta}
      </span>
      {label}
    </span>
  )
}

export function KpiCard({ label, value, icon: Icon, loading, error, trend, hint, accent = 'primary', className }: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={cn('flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-soft', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        <span className={cn('inline-flex size-8 items-center justify-center rounded-md', ACCENTS[accent])}>
          <Icon className="size-4" strokeWidth={1.9} />
        </span>
      </div>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-4 w-28" />
        </div>
      ) : error || value === undefined ? (
        <div className="space-y-1">
          <div className="font-heading text-3xl font-semibold text-muted-foreground/50">—</div>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <AlertCircle className="size-3.5" /> Unavailable
          </span>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="font-heading text-3xl font-semibold tracking-tight tabular">
            <CountUp value={value} />
          </div>
          {trend ? <Trend trend={trend} /> : <span className="text-xs text-muted-foreground">{hint ?? ' '}</span>}
        </div>
      )}
    </motion.div>
  )
}
