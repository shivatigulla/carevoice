import { motion } from 'framer-motion'
import { IndianRupee, Stethoscope } from 'lucide-react'
import { useMemo, useState } from 'react'

import { PersonAvatar } from '@/components/common/person-avatar'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, ErrorState, LanguageChip, SkeletonCard } from '@/components/signature'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDaySlots, useDepartments, useDoctors } from '@/hooks/use-data'
import { SLOT_STATUS } from '@/lib/status'
import { formatHm, hmToMinutes, istDayStart, istMinutes, istWeekdayKey } from '@/lib/time'
import type { DoctorRow, SlotRow } from '@/lib/types'
import { cn } from '@/lib/utils'

function AvailabilityBar({ doctor, slots, now }: { doctor: DoctorRow; slots: SlotRow[]; now: Date }) {
  const day = doctor.schedule[istWeekdayKey(now)]
  if (!day) {
    return (
      <div className="space-y-1.5">
        <div className="h-2.5 rounded-full bg-muted" />
        <div className="text-xs text-muted-foreground">Not consulting today</div>
      </div>
    )
  }
  const start = hmToMinutes(day.start)
  const end = hmToMinutes(day.end)
  const span = end - start
  const pct = (m: number) => `${((Math.min(Math.max(m, start), end) - start) / span) * 100}%`
  const nowMin = istMinutes(now)
  const open = slots.filter((s) => s.status === 'open').length
  const booked = slots.filter((s) => s.status === 'booked').length

  return (
    <div className="space-y-1.5">
      <div className="relative h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Today ${day.start} to ${day.end}: ${open} open, ${booked} booked`}>
        {slots.map((s) => {
          const a = istMinutes(s.starts_at)
          const b = istMinutes(s.ends_at)
          return (
            <Tooltip key={s.starts_at}>
              <TooltipTrigger asChild>
                <span
                  className={cn('absolute inset-y-0 border-r border-card', SLOT_STATUS[s.status].className)}
                  style={{ left: pct(a), width: `calc(${pct(b)} - ${pct(a)})` }}
                />
              </TooltipTrigger>
              <TooltipContent>
                {formatHm(s.starts_at)} · {SLOT_STATUS[s.status].label}
              </TooltipContent>
            </Tooltip>
          )
        })}
        {day.lunch_start && day.lunch_end && (
          <span
            className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,transparent_0_3px,var(--border)_3px_5px)]"
            style={{ left: pct(hmToMinutes(day.lunch_start)), width: `calc(${pct(hmToMinutes(day.lunch_end))} - ${pct(hmToMinutes(day.lunch_start))})` }}
          />
        )}
        {nowMin > start && (
          <span className="absolute inset-y-0 left-0 bg-background/60 dark:bg-background/50" style={{ width: pct(nowMin) }} aria-hidden />
        )}
      </div>
      <div className="flex justify-between font-mono text-[11px] text-muted-foreground tabular">
        <span>{day.start}</span>
        <span>
          {nowMin >= end ? 'Done for today' : `${open} open · ${booked} booked`}
        </span>
        <span>{day.end}</span>
      </div>
    </div>
  )
}

function DoctorCard({ doctor, slots, now, index }: { doctor: DoctorRow; slots: SlotRow[]; now: Date; index: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 10) * 0.03 }}
      className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-soft transition-shadow hover:shadow-lift"
    >
      <div className="flex items-start gap-3.5">
        <PersonAvatar name={doctor.name} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-heading text-[15px] font-semibold">{doctor.name}</h3>
          <div className="flex flex-wrap gap-x-2 text-[13px] text-muted-foreground">
            {doctor.name_te && <span lang="te">{doctor.name_te}</span>}
            {doctor.name_hi && <span lang="hi">{doctor.name_hi}</span>}
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-sm font-medium text-primary dark:text-accent-foreground">{doctor.department?.name}</div>
        {doctor.qualification && <div className="truncate text-xs text-muted-foreground">{doctor.qualification}</div>}
      </div>
      <AvailabilityBar doctor={doctor} slots={slots} now={now} />
      <div className="mt-auto flex items-center justify-between border-t pt-3">
        <div className="flex gap-1">
          {doctor.languages_spoken.map((l) => (
            <LanguageChip key={l} lang={l} />
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-mono tabular">{doctor.slot_minutes} min</span>
          {doctor.fee !== null && (
            <span className="inline-flex items-center font-mono text-foreground tabular">
              <IndianRupee className="size-3" />
              {Number(doctor.fee).toLocaleString('en-IN')}
            </span>
          )}
        </div>
      </div>
    </motion.article>
  )
}

export default function DoctorsPage() {
  const doctors = useDoctors()
  const departments = useDepartments()
  const [dept, setDept] = useState<string>('all')
  const now = useMemo(() => new Date(), [])
  const today = useMemo(() => istDayStart(0), [])
  const slots = useDaySlots(today)

  const slotsByDoctor = useMemo(() => {
    const m = new Map<string, SlotRow[]>()
    for (const s of slots.data ?? []) m.set(s.doctor_id, [...(m.get(s.doctor_id) ?? []), s])
    return m
  }, [slots.data])

  const visible = (doctors.data ?? []).filter((d) => dept === 'all' || d.department?.id === dept)

  return (
    <>
      <PageHeader icon={Stethoscope} title="Doctors" description="Consultants, their languages and today's availability." />

      {departments.data && departments.data.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2" role="radiogroup" aria-label="Department">
          {[{ id: 'all', name: 'All departments' }, ...departments.data].map((d) => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={dept === d.id}
              onClick={() => setDept(d.id)}
              className={cn(
                'h-8 rounded-full border px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                dept === d.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}

      {doctors.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </div>
      ) : doctors.isError ? (
        <div className="rounded-lg border bg-card">
          <ErrorState error={doctors.error} onRetry={() => doctors.refetch()} />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card/50">
          <EmptyState icon={Stethoscope} title="No doctors here yet" description="Doctors and their weekly schedules are added by your admin." />
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {(['open', 'booked', 'held'] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className={cn('size-2.5 rounded-sm', SLOT_STATUS[s].className)} /> {SLOT_STATUS[s].label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-[repeating-linear-gradient(135deg,transparent_0_2px,var(--muted-foreground)_2px_3px)] opacity-60" /> Lunch
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((d, i) => (
              <DoctorCard key={d.id} doctor={d} slots={slotsByDoctor.get(d.id) ?? []} now={now} index={i} />
            ))}
          </div>
        </>
      )}
    </>
  )
}
