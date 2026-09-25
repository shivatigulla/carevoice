import { CalendarOff, Clock, Phone, Stethoscope } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { MarkArrivedButton } from '@/components/appointments/mark-arrived-button'
import { PersonAvatar } from '@/components/common/person-avatar'
import { EmptyState, LanguageChip, StatusPill } from '@/components/signature'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { APPOINTMENT_STATUS } from '@/lib/status'
import { formatHm, formatPhone, hmToMinutes, istMinutes, istWeekdayKey, isSameIstDay } from '@/lib/time'
import type { AppointmentRow, DoctorRow } from '@/lib/types'
import { cn } from '@/lib/utils'

const HOUR_PX = 76
const GUTTER_PX = 56

const minToPx = (m: number) => (m / 60) * HOUR_PX

function useNowMinutes() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

function AppointmentBlock({ a, top, height }: { a: AppointmentRow; top: number; height: number }) {
  const s = APPOINTMENT_STATUS[a.status]
  const compact = height < 34
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'absolute inset-x-1 overflow-hidden rounded-md border px-2 text-left shadow-soft transition-[box-shadow,transform] outline-none hover:z-10 hover:shadow-lift focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/60',
            s.block,
            compact ? 'flex items-center gap-1.5 py-0' : 'py-1',
          )}
          style={{ top, height }}
          aria-label={`${a.patient?.name ?? 'Patient'} at ${formatHm(a.starts_at)}, ${s.label}`}
        >
          <span className={cn('block truncate text-[12px] leading-tight font-semibold', compact && 'min-w-0 flex-1')}>{a.patient?.name ?? 'Patient'}</span>
          <span className={cn('block truncate font-mono text-[10.5px] leading-tight opacity-80 tabular', compact && 'shrink-0')}>
            {formatHm(a.starts_at)}
            {!compact && ` · ${s.label}`}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="flex items-start gap-3 border-b p-4">
          <PersonAvatar name={a.patient?.name ?? '?'} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="font-heading font-semibold">{a.patient?.name}</div>
            <div className="flex items-center gap-2">
              <StatusPill tone={s.tone}>{s.label}</StatusPill>
              {a.patient && <LanguageChip lang={a.patient.preferred_language} />}
            </div>
          </div>
        </div>
        <dl className="space-y-2 p-4 text-[13px]">
          <div className="flex items-center gap-2">
            <Clock className="size-3.5 text-muted-foreground" />
            <span className="font-mono tabular">
              {formatHm(a.starts_at)}
              {a.slot && `–${formatHm(a.slot.ends_at)}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Stethoscope className="size-3.5 text-muted-foreground" />
            <span className="truncate">
              {a.doctor?.name}
              {a.doctor?.department && <span className="text-muted-foreground"> · {a.doctor.department.name}</span>}
            </span>
          </div>
          {a.patient && (
            <div className="flex items-center gap-2">
              <Phone className="size-3.5 text-muted-foreground" />
              <span className="font-mono tabular">{formatPhone(a.patient.phone)}</span>
            </div>
          )}
          {a.reason && <p className="rounded-md bg-muted/60 px-2.5 py-1.5 text-muted-foreground">{a.reason}</p>}
          <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
            <span className="capitalize">Source: {a.source}</span>
            <MarkArrivedButton appointment={a} />
          </div>
        </dl>
      </PopoverContent>
    </Popover>
  )
}

interface DayViewProps {
  day: Date
  doctors: DoctorRow[]
  appointments: AppointmentRow[]
}

export function DayView({ day, doctors, appointments }: DayViewProps) {
  const now = useNowMinutes()
  const scroller = useRef<HTMLDivElement>(null)
  const weekday = istWeekdayKey(day)
  const working = doctors.filter((d) => d.schedule[weekday])

  const range = useMemo(() => {
    if (!working.length) return null
    const starts = working.map((d) => hmToMinutes(d.schedule[weekday]!.start))
    const ends = working.map((d) => hmToMinutes(d.schedule[weekday]!.end))
    return { start: Math.floor(Math.min(...starts) / 60) * 60, end: Math.ceil(Math.max(...ends) / 60) * 60 }
  }, [working, weekday])

  const isTodayView = isSameIstDay(day, now)
  const dayKey = day.toISOString()
  useEffect(() => {
    // On today's view, open scrolled to about an hour before now.
    if (!scroller.current || !range) return
    const target = isTodayView ? minToPx(istMinutes(new Date()) - 60 - range.start) : 0
    scroller.current.scrollTo({ top: Math.max(0, target) })
  }, [dayKey, isTodayView, range])

  if (!range) {
    return <EmptyState icon={CalendarOff} title="No doctors consulting" description="Nobody is scheduled on this day. Pick another date." />
  }

  const hours = Array.from({ length: (range.end - range.start) / 60 }, (_, i) => range.start + i * 60)
  const height = minToPx(range.end - range.start)
  const byDoctor = new Map<string, AppointmentRow[]>()
  for (const a of appointments) byDoctor.set(a.doctor_id, [...(byDoctor.get(a.doctor_id) ?? []), a])
  const nowMin = istMinutes(now)
  const showNow = isTodayView && nowMin >= range.start && nowMin <= range.end

  return (
    <div ref={scroller} className="max-h-[calc(100dvh-270px)] min-h-[420px] overflow-auto [scrollbar-width:thin]">
      <div className="relative" style={{ minWidth: GUTTER_PX + working.length * 168 }}>
        {/* Header */}
        <div className="sticky top-0 z-20 flex border-b bg-card/95 backdrop-blur">
          <div className="sticky left-0 z-10 shrink-0 bg-card/95" style={{ width: GUTTER_PX }} />
          {working.map((d) => {
            const count = byDoctor.get(d.id)?.filter((a) => a.status !== 'cancelled').length ?? 0
            return (
              <div key={d.id} className="flex min-w-[168px] flex-1 items-center gap-2 border-l px-3 py-2.5">
                <PersonAvatar name={d.name} size="sm" />
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold">{d.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {d.department?.name} · <span className="font-mono tabular">{count}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Body */}
        <div className="relative flex" style={{ height }}>
          {showNow && (
            <div
              className="pointer-events-none absolute right-0 z-[15] flex -translate-y-1/2 items-center"
              style={{ left: GUTTER_PX - 5, top: minToPx(nowMin - range.start) }}
              aria-hidden
            >
              <span className="size-2.5 rounded-full bg-critical ring-2 ring-card" />
              <span className="h-[1.5px] flex-1 bg-critical" />
            </div>
          )}
          <div className="sticky left-0 z-10 shrink-0 border-r bg-card" style={{ width: GUTTER_PX }}>
            {hours.map((h) => (
              <div key={h} className="relative font-mono text-[10.5px] text-muted-foreground tabular" style={{ height: HOUR_PX }}>
                <span className="absolute -top-2 right-2 bg-card px-0.5">{String(h / 60).padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>

          {working.map((d) => {
            const sched = d.schedule[weekday]!
            const ds = hmToMinutes(sched.start)
            const de = hmToMinutes(sched.end)
            return (
              <div
                key={d.id}
                className="relative min-w-[168px] flex-1 border-l"
                style={{
                  backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${HOUR_PX / 2}px)`,
                }}
              >
                {/* Outside working hours */}
                <div className="absolute inset-x-0 top-0 bg-muted/70" style={{ height: minToPx(ds - range.start) }} />
                <div className="absolute inset-x-0 bottom-0 bg-muted/70" style={{ height: minToPx(range.end - de) }} />
                {sched.lunch_start && sched.lunch_end && (
                  <div
                    className="absolute inset-x-0 flex items-center justify-center bg-[repeating-linear-gradient(135deg,transparent_0_5px,var(--border)_5px_7px)] text-[10px] font-medium tracking-wider text-muted-foreground uppercase"
                    style={{ top: minToPx(hmToMinutes(sched.lunch_start) - range.start), height: minToPx(hmToMinutes(sched.lunch_end) - hmToMinutes(sched.lunch_start)) }}
                  >
                    Lunch
                  </div>
                )}
                {(byDoctor.get(d.id) ?? []).map((a) => {
                  const startMin = istMinutes(a.starts_at)
                  const endMin = a.slot ? istMinutes(a.slot.ends_at) : startMin + d.slot_minutes
                  return <AppointmentBlock key={a.id} a={a} top={minToPx(startMin - range.start) + 1} height={Math.max(minToPx(endMin - startMin) - 2, 20)} />
                })}
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}
