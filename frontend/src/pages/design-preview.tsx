/**
 * Development-only gallery of the signature components (route /design, registered only when
 * import.meta.env.DEV). The values below are illustrative props for visual QA, never shown to staff.
 */
import { CalendarCheck2, Inbox, Palette, PhoneCall, Radio } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import {
  ActionCard,
  AgentAvatar,
  ConfirmationCard,
  EmptyState,
  KpiCard,
  LanguageChip,
  LiveWaveform,
  SkeletonCard,
  StatusPill,
  TimelineItem,
  ToolCallCard,
  type ConfirmationState,
} from '@/components/signature'
import { AGENT_META, type AgentKey } from '@/lib/agents'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-sm font-semibold text-muted-foreground">{title}</h2>
      <div className="rounded-lg border bg-card p-5 shadow-soft">{children}</div>
    </section>
  )
}

export default function DesignPreviewPage() {
  const [confirm, setConfirm] = useState<ConfirmationState>('pending')

  return (
    <>
      <PageHeader icon={Palette} title="Component preview" description="Development-only gallery of signature components with sample props. Not part of the product UI." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="AgentAvatar · LiveWaveform">
          <div className="flex flex-wrap items-center gap-5">
            {(Object.keys(AGENT_META) as AgentKey[]).map((k, i) => (
              <AgentAvatar key={k} agentKey={k} active={i % 2 === 0} />
            ))}
            <LiveWaveform bars={6} />
            <LiveWaveform bars={6} active={false} />
          </div>
        </Section>

        <Section title="LanguageChip · StatusPill">
          <div className="flex flex-wrap items-center gap-2">
            <LanguageChip lang="te" showNative />
            <LanguageChip lang="hi" showNative />
            <LanguageChip lang="en" />
            <StatusPill tone="live" pulse>Live</StatusPill>
            <StatusPill tone="ok">Ready</StatusPill>
            <StatusPill tone="ai">AI</StatusPill>
            <StatusPill tone="warning">Waiting</StatusPill>
            <StatusPill tone="critical">Critical</StatusPill>
            <StatusPill tone="neutral">Paused</StatusPill>
          </div>
        </Section>

        <Section title="KpiCard">
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard label="Sample metric" icon={PhoneCall} value={128} trend={{ delta: 12, label: 'vs yesterday' }} />
            <KpiCard label="Live sample" icon={Radio} accent="live" value={3} hint="Calls in progress" />
            <KpiCard label="Loading" icon={CalendarCheck2} value={undefined} loading />
          </div>
        </Section>

        <Section title="TimelineItem · SkeletonCard">
          <ol>
            <TimelineItem icon={PhoneCall} tone="ai" title="Sample event" description="Supporting description text." time="10:42" />
            <TimelineItem icon={CalendarCheck2} tone="live" title="Another event" time="10:44" last />
          </ol>
          <SkeletonCard className="mt-4" />
        </Section>

        <Section title="ToolCallCard (indigo)">
          <div className="space-y-3">
            <ToolCallCard name="sample_tool" args={{ department: 'sample', part_of_day: 'morning' }} status="ok" message="Illustrative result message." latencyMs={182} time="10:42:07" />
            <ToolCallCard name="sample_write_tool" args={{ slot_id: 'sample' }} status="denied" message="Illustrative policy denial." />
            <ToolCallCard name="sample_running_tool" status="running" />
          </div>
        </Section>

        <Section title="ActionCard (mint) · ConfirmationCard">
          <div className="space-y-3">
            <ActionCard title="Sample action completed" details={[{ label: 'Field', value: 'Value' }, { label: 'Another', value: 'Value' }]} time="10:43" />
            <ConfirmationCard
              title="Sample write awaiting approval"
              description="Illustrative description of what will change."
              details={[{ label: 'Affects', value: 'Sample records' }]}
              state={confirm}
              onApprove={() => {
                setConfirm('approving')
                setTimeout(() => setConfirm('approved'), 700)
              }}
              onCancel={() => setConfirm('cancelled')}
            />
          </div>
        </Section>

        <Section title="EmptyState">
          <EmptyState compact icon={Inbox} title="Nothing here yet" description="Explains what will appear and how it gets here." />
        </Section>
      </div>
    </>
  )
}
