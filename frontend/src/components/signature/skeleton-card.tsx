import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface SkeletonCardProps {
  lines?: number
  avatar?: boolean
  /** Render without the card chrome (for rows inside an existing panel). */
  bare?: boolean
  className?: string
}

export function SkeletonCard({ lines = 2, avatar = true, bare = false, className }: SkeletonCardProps) {
  return (
    <div aria-hidden className={cn('flex items-start gap-3', !bare && 'rounded-lg border bg-card p-4 shadow-soft', className)}>
      {avatar && <Skeleton className="size-10 shrink-0 rounded-lg" />}
      <div className="flex-1 space-y-2 pt-0.5">
        <Skeleton className="h-4 w-2/5" />
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-3/5' : 'w-4/5')} />
        ))}
      </div>
    </div>
  )
}
