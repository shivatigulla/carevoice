import { cn } from '@/lib/utils'

const TINTS = [
  'bg-primary/12 text-primary dark:text-accent-foreground',
  'bg-ai/12 text-ai',
  'bg-warning/18 text-warning-foreground dark:text-warning',
  'bg-live/15 text-live-foreground dark:text-live',
]

function initials(name: string) {
  const parts = name.replace(/^Dr\.?\s+/i, '').split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

function tintFor(name: string) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TINTS[h % TINTS.length]
}

const SIZES = { sm: 'size-8 text-[11px]', md: 'size-10 text-xs', lg: 'size-14 text-base' }

/** Initials avatar for people (patients, doctors, staff) with a stable tint per name. */
export function PersonAvatar({ name, size = 'md', className }: { name: string; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-heading font-bold', SIZES[size], tintFor(name), className)}
    >
      {initials(name)}
    </span>
  )
}
