import { CalendarCheck2, PhoneCall, PhoneForwarded, Radio, Siren } from 'lucide-react'

import { KpiCard } from '@/components/signature'
import { useKpis, useLiveCalls } from '@/hooks/use-data'

export function KpiRow() {
  const kpis = useKpis()
  const live = useLiveCalls()
  const k = kpis.data

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-5">
      <KpiCard
        label="Live now"
        icon={Radio}
        accent="live"
        loading={live.isLoading}
        error={live.isError}
        value={live.data?.length}
        hint="Calls in progress"
      />
      <KpiCard
        label="Calls today"
        icon={PhoneCall}
        loading={kpis.isLoading}
        error={kpis.isError}
        value={k?.callsToday}
        trend={k ? { delta: k.callsToday - k.callsSameTimeYesterday, label: 'vs this time yesterday' } : undefined}
      />
      <KpiCard
        label="Appointments booked"
        icon={CalendarCheck2}
        accent="ai"
        loading={kpis.isLoading}
        error={kpis.isError}
        value={k?.bookedToday}
        trend={k ? { delta: k.bookedToday - k.bookedSameTimeYesterday, label: 'vs this time yesterday' } : undefined}
      />
      <KpiCard
        label="Follow-ups due"
        icon={PhoneForwarded}
        accent="primary"
        loading={kpis.isLoading}
        error={kpis.isError}
        value={k?.followUpsDueToday}
        hint="Scheduled for today"
      />
      <KpiCard
        label="Open escalations"
        icon={Siren}
        accent={k && k.criticalEscalations > 0 ? 'critical' : 'warning'}
        loading={kpis.isLoading}
        error={kpis.isError}
        value={k?.openEscalations}
        hint={k && k.criticalEscalations > 0 ? `${k.criticalEscalations} critical` : 'Needs a human'}
        className="col-span-2 xl:col-span-1"
      />
    </div>
  )
}
