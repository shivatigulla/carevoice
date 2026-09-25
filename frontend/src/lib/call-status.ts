import type { StatusTone } from '@/components/signature'
import type { CallRow } from '@/hooks/use-calls'

export function callTone(c: Pick<CallRow, 'status'>): StatusTone {
  return c.status === 'live' ? 'live' : c.status === 'completed' ? 'ok' : c.status === 'no_answer' ? 'warning' : 'critical'
}

export function callLabel(c: Pick<CallRow, 'status' | 'current_stage'>) {
  if (c.status === 'live') return c.current_stage ? c.current_stage.charAt(0).toUpperCase() + c.current_stage.slice(1) : 'Live'
  return { completed: 'Completed', failed: 'Failed', no_answer: 'Not answered' }[c.status]
}
