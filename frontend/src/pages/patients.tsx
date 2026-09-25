import { motion } from 'framer-motion'
import { HeartHandshake, PhoneOff, Search, UserX, Users } from 'lucide-react'
import { useDeferredValue, useState } from 'react'

import { PersonAvatar } from '@/components/common/person-avatar'
import { Segmented } from '@/components/common/segmented'
import { PageHeader } from '@/components/layout/page-header'
import { PatientDrawer } from '@/components/patients/patient-drawer'
import { EmptyState, ErrorState, LanguageChip, SkeletonCard } from '@/components/signature'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePatients } from '@/hooks/use-data'
import { ageFromDob, formatPhone } from '@/lib/time'
import type { PatientRow } from '@/lib/types'
import { cn } from '@/lib/utils'

type LangFilter = 'all' | 'te' | 'hi' | 'en'

function Flags({ p }: { p: PatientRow }) {
  const flags = [
    p.caregiver_name && { icon: HeartHandshake, label: `Caregiver: ${p.caregiver_name}`, className: 'text-primary dark:text-accent-foreground' },
    p.opt_out && { icon: UserX, label: 'Opted out of calls', className: 'text-critical' },
    p.dnd && { icon: PhoneOff, label: 'Do not disturb', className: 'text-warning-foreground dark:text-warning' },
  ].filter(Boolean) as { icon: typeof UserX; label: string; className: string }[]
  if (!flags.length) return <span className="text-muted-foreground/50">—</span>
  return (
    <div className="flex gap-1.5">
      {flags.map((f) => (
        <Tooltip key={f.label}>
          <TooltipTrigger asChild>
            <span className={cn('inline-flex size-6 items-center justify-center rounded-md bg-muted', f.className)} aria-label={f.label}>
              <f.icon className="size-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent>{f.label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

export default function PatientsPage() {
  const [search, setSearch] = useState('')
  const [lang, setLang] = useState<LangFilter>('all')
  const [selected, setSelected] = useState<PatientRow | null>(null)
  const deferred = useDeferredValue(search)
  const patients = usePatients(deferred, lang)
  const rows = patients.data?.rows ?? []

  return (
    <>
      <PageHeader
        icon={Users}
        title="Patients"
        description="Everyone registered with your hospital, their preferred language and caregivers."
        actions={
          patients.data && (
            <span className="font-mono text-xs text-muted-foreground tabular">
              {patients.data.total} {patients.data.total === 1 ? 'patient' : 'patients'}
            </span>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone or MRN"
            aria-label="Search patients"
            className="h-9 bg-card pl-9"
          />
        </div>
        <Segmented
          label="Preferred language"
          value={lang}
          onChange={setLang}
          options={[
            { value: 'all', label: 'All' },
            { value: 'te', label: 'Telugu' },
            { value: 'hi', label: 'Hindi' },
            { value: 'en', label: 'English' },
          ]}
        />
      </div>

      <div className="overflow-hidden rounded-lg border bg-card shadow-soft">
        {patients.isLoading ? (
          <div className="space-y-5 p-5">
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonCard key={i} bare lines={1} />
            ))}
          </div>
        ) : patients.isError ? (
          <ErrorState error={patients.error} onRetry={() => patients.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            compact
            icon={Users}
            title={search || lang !== 'all' ? 'No matching patients' : 'No patients yet'}
            description={search || lang !== 'all' ? 'Try a different name, phone number or language.' : 'Patients are added when they call in, are booked by staff, or imported.'}
          />
        ) : (
          <div className={cn('overflow-x-auto transition-opacity', patients.isPlaceholderData && 'opacity-60')}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Patient</th>
                  <th className="px-3 py-2.5 font-medium">Phone</th>
                  <th className="hidden px-3 py-2.5 font-medium md:table-cell">Age · Gender</th>
                  <th className="px-3 py-2.5 font-medium">Language</th>
                  <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((p, i) => {
                  const age = ageFromDob(p.dob)
                  return (
                    <motion.tr
                      key={p.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2, delay: Math.min(i, 12) * 0.015 }}
                      onClick={() => setSelected(p)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelected(p))}
                      tabIndex={0}
                      aria-label={`Open ${p.name}`}
                      className="cursor-pointer transition-colors outline-none hover:bg-muted/50 focus-visible:bg-accent"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <PersonAvatar name={p.name} size="sm" />
                          <div className="min-w-0">
                            <div className="truncate font-medium">{p.name}</div>
                            {p.mrn && <div className="font-mono text-[11px] text-muted-foreground">{p.mrn}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-[13px] whitespace-nowrap tabular">{formatPhone(p.phone)}</td>
                      <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">
                        {age !== null ? `${age} y` : '—'}
                        {p.gender && <span className="capitalize"> · {p.gender}</span>}
                      </td>
                      <td className="px-3 py-3">
                        <LanguageChip lang={p.preferred_language} />
                      </td>
                      <td className="hidden px-3 py-3 lg:table-cell">
                        <Flags p={p} />
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PatientDrawer patient={selected} onClose={() => setSelected(null)} />
    </>
  )
}
