import { cn } from '@/lib/utils'

// Fixed, irregular rhythm so the bars look like speech rather than a metronome.
const DELAYS = [0, 0.32, 0.12, 0.5, 0.22, 0.4, 0.08, 0.28]
const DURATIONS = [1.05, 0.9, 1.2, 0.95, 1.1, 0.85, 1.15, 1]

interface LiveWaveformProps {
  bars?: number
  active?: boolean
  className?: string
  barClassName?: string
}

export function LiveWaveform({ bars = 5, active = true, className, barClassName }: LiveWaveformProps) {
  return (
    <span aria-hidden className={cn('inline-flex h-4 items-center gap-[3px]', className)}>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-full w-[3px] origin-center rounded-full',
            active ? 'animate-wave bg-live' : 'scale-y-[0.3] bg-muted-foreground/40',
            barClassName,
          )}
          style={active ? { animationDelay: `${DELAYS[i % DELAYS.length]}s`, animationDuration: `${DURATIONS[i % DURATIONS.length]}s` } : undefined}
        />
      ))}
    </span>
  )
}
