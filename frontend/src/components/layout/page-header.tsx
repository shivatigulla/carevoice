import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  icon?: LucideIcon
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, description, icon: Icon, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:mb-8', className)}>
      <div className="flex items-start gap-3.5">
        {Icon && (
          <span className="mt-0.5 hidden size-10 shrink-0 items-center justify-center rounded-lg border bg-card text-primary shadow-soft sm:inline-flex dark:text-accent-foreground">
            <Icon className="size-5" strokeWidth={1.8} />
          </span>
        )}
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
