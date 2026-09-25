import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface PanelProps {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

/** Titled card used for dashboard sections. */
export function Panel({ title, description, actions, children, className, bodyClassName }: PanelProps) {
  return (
    <section className={cn('flex flex-col rounded-lg border bg-card shadow-soft', className)}>
      <header className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="font-heading text-[15px] font-semibold">{title}</h2>
          {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className={cn('flex-1', bodyClassName)}>{children}</div>
    </section>
  )
}
