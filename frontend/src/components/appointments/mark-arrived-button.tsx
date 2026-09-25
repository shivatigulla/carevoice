import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useMembership } from '@/hooks/use-data'
import { apiErrorMessage, checkInAppointment } from '@/lib/api'
import { CAN_CHECK_IN } from '@/lib/status'
import { isSameIstDay } from '@/lib/time'
import type { AppointmentRow } from '@/lib/types'

/** "Mark arrived": a staff write, so it goes through the backend (JWT-authenticated), never supabase-js. */
export function MarkArrivedButton({ appointment, size = 'sm' }: { appointment: AppointmentRow; size?: 'sm' | 'xs' }) {
  const qc = useQueryClient()
  const role = useMembership().data?.role
  const mutation = useMutation({
    mutationFn: () => checkInAppointment(appointment.id),
    onSuccess: () => {
      toast.success(`${appointment.patient?.name ?? 'Patient'} marked as arrived`)
      qc.invalidateQueries({ queryKey: ['appointments'] })
      qc.invalidateQueries({ queryKey: ['kpis'] })
    },
    onError: (e) => toast.error(`Couldn't mark as arrived: ${apiErrorMessage(e)}`),
  })

  const allowed = role === 'admin' || role === 'reception'
  if (!allowed || !CAN_CHECK_IN.includes(appointment.status) || !isSameIstDay(appointment.starts_at, new Date())) return null

  return (
    <Button
      size={size}
      variant="outline"
      className="border-live/40 text-live-foreground hover:bg-live/10 dark:text-live"
      disabled={mutation.isPending}
      onClick={(e) => {
        e.stopPropagation()
        mutation.mutate()
      }}
    >
      {mutation.isPending ? <Loader2 className="animate-spin" /> : <Check />}
      Mark arrived
    </Button>
  )
}
