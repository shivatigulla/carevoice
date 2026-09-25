import { LayoutDashboard } from 'lucide-react'

import { AiWorkforce } from '@/components/dashboard/ai-workforce'
import { EscalationsPanel } from '@/components/dashboard/escalations-panel'
import { KpiRow } from '@/components/dashboard/kpi-row'
import { LiveCallsPanel } from '@/components/dashboard/live-calls-panel'
import { PageHeader } from '@/components/layout/page-header'
import { queryKeys } from '@/hooks/use-data'
import { useRealtimeInvalidate } from '@/hooks/use-realtime'

export default function DashboardPage() {
  useRealtimeInvalidate('agents', [queryKeys.agents])
  useRealtimeInvalidate('appointments', [queryKeys.kpis])
  useRealtimeInvalidate('follow_ups', [queryKeys.kpis])

  return (
    <>
      <PageHeader icon={LayoutDashboard} title="Dashboard" description="Your AI voice operations at a glance — updated live." />
      <div className="space-y-6">
        <KpiRow />
        <AiWorkforce />
        <div className="grid gap-6 xl:grid-cols-5">
          <LiveCallsPanel className="xl:col-span-3" />
          <EscalationsPanel className="xl:col-span-2" />
        </div>
      </div>
    </>
  )
}
