import { motion } from 'framer-motion'
import { Ban, Check, Loader2, TriangleAlert, Wrench } from 'lucide-react'

import { cn } from '@/lib/utils'

export type ToolCallStatus = 'running' | 'ok' | 'denied' | 'error'

const STATUS: Record<ToolCallStatus, { label: string; icon: typeof Check; className: string }> = {
  running: { label: 'Running', icon: Loader2, className: 'text-ai [&_svg]:animate-spin' },
  ok: { label: 'OK', icon: Check, className: 'text-live-foreground dark:text-live' },
  denied: { label: 'Denied by policy', icon: Ban, className: 'text-warning-foreground dark:text-warning' },
  error: { label: 'Error', icon: TriangleAlert, className: 'text-critical' },
}

interface ToolCallCardProps {
  /** Tool name as registered, e.g. `get_available_slots`. */
  name: string
  args?: Record<string, unknown>
  status: ToolCallStatus
  /** Short, human-readable result or the policy's reason. */
  message?: string
  latencyMs?: number
  time?: string
  className?: string
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** Indigo card: the agent asked the backend to run a tool (Agent Brain, Tool Playground). */
export function ToolCallCard({ name, args, status, message, latencyMs, time, className }: ToolCallCardProps) {
  const s = STATUS[status]
  const entries = Object.entries(args ?? {})
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn('overflow-hidden rounded-lg border border-ai/25 bg-ai/[0.04] dark:bg-ai/[0.07]', className)}
    >
      <div className="flex items-center gap-2 border-b border-ai/15 px-3 py-2">
        <span className="inline-flex size-6 items-center justify-center rounded-md bg-ai/15 text-ai">
          <Wrench className="size-3.5" strokeWidth={2} />
        </span>
        <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] font-medium text-ai">{name}()</code>
        <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium', s.className)}>
          <s.icon className="size-3.5" />
          {s.label}
        </span>
      </div>
      {(entries.length > 0 || message) && (
        <div className="space-y-2 px-3 py-2.5">
          {entries.length > 0 && (
            <dl className="flex flex-wrap gap-1.5">
              {entries.map(([k, v]) => (
                <div key={k} className="inline-flex max-w-full items-center gap-1 rounded-md bg-card px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-border ring-inset">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="truncate">{formatValue(v)}</dd>
                </div>
              ))}
            </dl>
          )}
          {message && <p className="text-[13px] leading-relaxed">{message}</p>}
        </div>
      )}
      {(latencyMs !== undefined || time) && (
        <div className="flex justify-between border-t border-ai/10 px-3 py-1.5 font-mono text-[10.5px] text-muted-foreground">
          <span>{time}</span>
          {latencyMs !== undefined && <span className="tabular">{latencyMs} ms</span>}
        </div>
      )}
    </motion.div>
  )
}
