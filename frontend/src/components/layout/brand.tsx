import { cn } from '@/lib/utils'

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-soft', className)}>
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
        <path d="M5 10v4" />
        <path d="M9 7v10" />
        <path d="M13 4v16" />
        <path d="M17 8v8" />
      </svg>
      <span className="absolute top-1/2 right-[5px] size-[5px] -translate-y-1/2 rounded-full bg-live" />
    </span>
  )
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-heading text-[15px] font-bold tracking-tight', className)}>
      Care<span className="text-primary dark:text-accent-foreground">Voice</span>
    </span>
  )
}
