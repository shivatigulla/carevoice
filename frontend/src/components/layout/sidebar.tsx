import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { BrandMark, BrandWordmark } from '@/components/layout/brand'
import { NAV_SECTIONS, type NavItem } from '@/components/layout/nav'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useLiveCalls } from '@/hooks/use-data'
import { cn } from '@/lib/utils'

function LiveBadge({ count, collapsed }: { count: number; collapsed: boolean }) {
  if (count <= 0) return null
  if (collapsed) {
    return (
      <span className="absolute top-1.5 right-1.5 inline-flex size-2">
        <span className="absolute inset-0 animate-ping rounded-full bg-live opacity-75" />
        <span className="relative size-2 rounded-full bg-live ring-2 ring-sidebar" />
      </span>
    )
  }
  return (
    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded-full bg-live/15 px-1.5 font-mono text-[11px] font-medium text-live-foreground ring-1 ring-live/30 ring-inset dark:text-live">
      <span className="size-1.5 animate-pulse rounded-full bg-live" />
      {count}
    </span>
  )
}

function SidebarLink({ item, collapsed, badge, onNavigate }: { item: NavItem; collapsed: boolean; badge?: number; onNavigate?: () => void }) {
  const Icon = item.icon
  const link = (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex h-8 items-center gap-3 rounded-md px-2.5 text-[13.5px] font-medium text-muted-foreground transition-colors outline-none',
          'hover:bg-sidebar-accent/70 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/50',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          collapsed && 'justify-center px-0',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && <span aria-hidden className="absolute top-1.5 bottom-1.5 -left-3 w-[3px] rounded-r-full bg-primary" />}
          <Icon className="size-[18px] shrink-0" strokeWidth={isActive ? 2.1 : 1.8} />
          {!collapsed && <span className="truncate">{item.label}</span>}
          {badge !== undefined && <LiveBadge count={badge} collapsed={collapsed} />}
        </>
      )}
    </NavLink>
  )
  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {badge ? ` · ${badge} live` : ''}
      </TooltipContent>
    </Tooltip>
  )
}

interface SidebarProps {
  collapsed: boolean
  onToggle?: () => void
  onNavigate?: () => void
  className?: string
}

export function Sidebar({ collapsed, onToggle, onNavigate, className }: SidebarProps) {
  const liveCalls = useLiveCalls()
  const liveCount = liveCalls.data?.length ?? 0

  return (
    <aside className={cn('flex h-full flex-col bg-sidebar text-sidebar-foreground', className)}>
      <div className={cn('flex h-16 shrink-0 items-center gap-2.5 px-4', collapsed && 'justify-center px-0')}>
        <BrandMark />
        {!collapsed && <BrandWordmark />}
      </div>

      <nav className={cn('flex-1 space-y-4 overflow-y-auto px-3 py-2 [scrollbar-width:thin]', collapsed && 'px-2')} aria-label="Main">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="space-y-0.5">
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border first:hidden" />
            ) : (
              <div className="mb-1.5 px-2.5 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/80 uppercase">{section.label}</div>
            )}
            {section.items.map((item) => (
              <SidebarLink
                key={item.path}
                item={item}
                collapsed={collapsed}
                onNavigate={onNavigate}
                badge={item.path === '/' ? liveCount : undefined}
              />
            ))}
          </div>
        ))}
      </nav>

      {onToggle && (
        <div className={cn('shrink-0 border-t border-sidebar-border p-3', collapsed && 'flex justify-center px-2')}>
          <Button
            variant="ghost"
            size={collapsed ? 'icon' : 'sm'}
            onClick={onToggle}
            className={cn('text-muted-foreground', !collapsed && 'w-full justify-start')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {!collapsed && 'Collapse'}
          </Button>
        </div>
      )}
    </aside>
  )
}
