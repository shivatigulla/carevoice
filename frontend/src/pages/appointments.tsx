import { CalendarDays, ChevronLeft, ChevronRight, LayoutList, Columns3 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { DayView } from '@/components/appointments/day-view'
import { MarkArrivedButton } from '@/components/appointments/mark-arrived-button'
import { PersonAvatar } from '@/components/common/person-avatar'
import { Segmented } from '@/components/common/segmented'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, ErrorState, LanguageChip, SkeletonCard, StatusPill } from '@/components/signature'
import { Button } from '@/components/ui/button'
import { useDayAppointments, useDepartments, useDoctors } from '@/hooks/use-data'
import { useRealtimeInvalidate } from '@/hooks/use-realtime'
import { APPOINTMENT_STATUS } from '@/lib/status'
import { formatDayLabel, formatHm, istDayStart } from '@/lib/time'
import type { AppointmentRow, AppointmentStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

type View = 'day' | 'list'

const LEGEND: AppointmentStatus[] = ['booked', 'confirmed', 'checked_in', 'completed', 'no_show', 'cancelled']

function ListView({ appointments }: { appointments: AppointmentRow[] }) {
  if (!appointments.length) {
    return <EmptyState icon={CalendarDays} title="No appointments on this day" description="Bookings made by agents or staff appear here instantly." />
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-5 py-2.5 font-medium">Time</th>
            <th className="px-3 py-2.5 font-medium">Patient</th>
            <th className="hidden px-3 py-2.5 font-medium md:table-cell">Doctor</th>
            <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Reason</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-5 py-2.5 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {appointments.map((a) => {
            const s = APPOINTMENT_STATUS[a.status]
            return (
              <tr key={a.id} className={cn('transition-colors hover:bg-muted/40', a.status === 'cancelled' && 'opacity-60')}>
                <td className="px-5 py-3 font-mono text-[13px] whitespace-nowrap tabular">{formatHm(a.starts_at)}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <PersonAvatar name={a.patient?.name ?? '?'} size="sm" />
                    <span className="truncate font-medium">{a.patient?.name}</span>
                    {a.patient && <LanguageChip lang={a.patient.preferred_language} />}
                  </div>
                </td>
                <td className="hidden px-3 py-3 md:table-cell">
                  <div className="truncate">{a.doctor?.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{a.doctor?.department?.name}</div>
                </td>
                <td className="hidden max-w-[220px] truncate px-3 py-3 text-muted-foreground lg:table-cell">{a.reason ?? '—'}</td>
                <td className="px-3 py-3">
                  <StatusPill tone={s.tone}>{s.label}</StatusPill>
                </td>
                <td className="px-5 py-3 text-right">
                  <MarkArrivedButton appointment={a} size="xs" />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function AppointmentsPage() {
  const [offset, setOffset] = useState(0)
  const [view, setView] = useState<View>('day')
  const [dept, setDept] = useState('all')
  const day = useMemo(() => istDayStart(offset), [offset])

  const doctors = useDoctors()
  const departments = useDepartments()
  const appts = useDayAppointments(day)
  useRealtimeInvalidate('appointments', [['appointments'], ['kpis']])

  const doctorsInDept = (doctors.data ?? []).filter((d) => dept === 'all' || d.department?.id === dept)
  const doctorIds = new Set(doctorsInDept.map((d) => d.id))
  const dayAppointments = (appts.data ?? []).filter((a) => doctorIds.has(a.doctor_id))
  const active = dayAppointments.filter((a) => a.status !== 'cancelled')
  const arrived = dayAppointments.filter((a) => a.status === 'checked_in').length

  const loading = doctors.isLoading || appts.isLoading
  const error = doctors.error ?? appts.error

  return (
    <>
      <PageHeader icon={CalendarDays} title="Appointments" description="Every booking by agents and staff, checked against real doctor availability." />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => setOffset((o) => o - 1)} aria-label="Previous day">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOffset(0)} disabled={offset === 0}>
            Today
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => setOffset((o) => o + 1)} aria-label="Next day">
            <ChevronRight />
          </Button>
          <h2 className="ml-2 font-heading text-lg font-semibold">{formatDayLabel(day)}</h2>
          {appts.data && (
            <span className="ml-1 text-sm text-muted-foreground">
              <span className="font-mono tabular">{active.length}</span> booked
              {arrived > 0 && (
                <>
                  {' · '}
                  <span className="font-mono tabular">{arrived}</span> arrived
                </>
              )}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            aria-label="Department"
            className="h-8 rounded-md border bg-card px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="all">All departments</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'day', label: <><Columns3 className="size-3.5" /> Day</> },
              { value: 'list', label: <><LayoutList className="size-3.5" /> List</> },
            ]}
          />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {LEGEND.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-sm border', APPOINTMENT_STATUS[s].block)} />
            {APPOINTMENT_STATUS[s].label}
          </span>
        ))}
      </div>

      <div className={cn('overflow-hidden rounded-lg border bg-card shadow-soft transition-opacity', appts.isPlaceholderData && 'opacity-60')}>
        {loading ? (
          <div className="space-y-5 p-5">
            {Array.from({ length: 5 }, (_, i) => (
              <SkeletonCard key={i} bare lines={1} />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => (doctors.refetch(), appts.refetch())} />
        ) : view === 'day' ? (
          <DayView day={day} doctors={doctorsInDept} appointments={dayAppointments} />
        ) : (
          <ListView appointments={dayAppointments} />
        )}
      </div>
    </>
  )
}
