import { CheckCircle2, CircleDashed, Loader2, XCircle } from 'lucide-react'

import { StatusPill, type StatusTone } from '@/components/signature'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useHealth } from '@/hooks/use-health'
import type { CheckStatus } from '@/lib/api'
import { env } from '@/lib/env'
import { formatTime } from '@/lib/time'

const CHECK_LABELS: Record<string, string> = {
  database: 'Database',
  storage: 'Supabase Storage',
  openai: 'OpenAI key',
  sarvam: 'Sarvam key',
}

const CHECK_ICON: Record<CheckStatus, { icon: typeof CheckCircle2; className: string }> = {
  ok: { icon: CheckCircle2, className: 'text-live-foreground dark:text-live' },
  missing: { icon: CircleDashed, className: 'text-warning-foreground dark:text-warning' },
  error: { icon: XCircle, className: 'text-critical' },
}

/** Topbar pill summarising backend /health, with per-check detail on click. */
export function SystemStatus() {
  const health = useHealth()

  let tone: StatusTone = 'neutral'
  let label = 'Checking…'
  if (health.isError) {
    tone = 'critical'
    label = 'API offline'
  } else if (health.data) {
    const { status, checks } = health.data
    const needsSetup = Object.values(checks).some((c) => c.status === 'missing')
    if (status === 'ok') {
      tone = 'live'
      label = 'All systems normal'
    } else if (checks.database?.status === 'error') {
      tone = 'critical'
      label = 'Database down'
    } else if (needsSetup) {
      tone = 'warning'
      label = 'Setup needed'
    } else {
      tone = 'warning'
      label = 'Degraded'
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50" aria-label={`System status: ${label}`}>
          <StatusPill tone={tone} pulse={tone === 'live'}>
            {health.isLoading && <Loader2 className="-ml-0.5 size-3 animate-spin" />}
            <span className="hidden sm:inline">{label}</span>
          </StatusPill>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>System status</span>
          {health.dataUpdatedAt > 0 && (
            <span className="font-mono text-[11px] font-normal text-muted-foreground">{formatTime(new Date(health.dataUpdatedAt))}</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {health.isError ? (
          <p className="px-2 py-2 text-xs leading-relaxed text-muted-foreground">
            Can't reach the backend at <span className="font-mono">{env.apiUrl}</span>. Is <span className="font-mono">npm run dev</span> running?
          </p>
        ) : health.data ? (
          <ul className="space-y-0.5 p-1">
            {Object.entries(health.data.checks).map(([key, check]) => {
              const { icon: Icon, className } = CHECK_ICON[check.status]
              return (
                <li key={key} className="flex items-start gap-2 rounded-md px-1 py-1.5">
                  <Icon className={`mt-px size-4 shrink-0 ${className}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 text-[13px] font-medium">
                      {CHECK_LABELS[key] ?? key}
                      {check.latency_ms !== null && <span className="font-mono text-[11px] font-normal text-muted-foreground">{check.latency_ms}ms</span>}
                    </div>
                    {check.detail && <div className="truncate text-xs text-muted-foreground" title={check.detail}>{check.detail}</div>}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="px-2 py-2 text-xs text-muted-foreground">Checking services…</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
