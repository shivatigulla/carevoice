import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: ReactNode; title?: string }[]
  label: string
  className?: string
}

/** Compact single-choice toggle (filters, view switches). */
export function Segmented<T extends string>({ value, onChange, options, label, className }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex h-8 items-center rounded-md border bg-muted/60 p-0.5', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex h-full items-center gap-1.5 rounded-[7px] px-2.5 text-[13px] font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              active ? 'bg-card text-foreground shadow-soft' : 'hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
