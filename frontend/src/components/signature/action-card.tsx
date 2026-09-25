import { motion } from 'framer-motion'
import { CircleCheckBig, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface ActionCardProps {
  /** What changed in the world, e.g. "Appointment booked". */
  title: string
  icon?: LucideIcon
  /** Label/value pairs describing the change. */
  details?: { label: string; value: ReactNode }[]
  time?: string
  className?: string
}

/** Mint card: an agent action that actually changed hospital data (booked, cancelled, task created). */
export function ActionCard({ title, icon: Icon = CircleCheckBig, details, time, className }: ActionCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn('relative overflow-hidden rounded-lg border border-live/35 bg-live/[0.07] dark:bg-live/[0.06]', className)}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-live" />
      <div className="flex items-start gap-2.5 py-2.5 pr-3 pl-4">
        <span className="mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-live/20 text-live-foreground dark:text-live">
          <Icon className="size-3.5" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13.5px] font-semibold">{title}</p>
            {time && <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground tabular">{time}</span>}
          </div>
          {details && details.length > 0 && (
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px]">
              {details.map((d) => (
                <div key={d.label} className="contents">
                  <dt className="text-muted-foreground">{d.label}</dt>
                  <dd className="min-w-0 truncate">{d.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </motion.div>
  )
}
