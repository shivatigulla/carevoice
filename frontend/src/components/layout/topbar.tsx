import type { ReactNode } from 'react'
import { Building2, LogOut, Menu, Moon, PhoneCall, Search, Sparkles, Sun, type LucideIcon } from 'lucide-react'

import { IstClock } from '@/components/layout/ist-clock'
import { SystemStatus } from '@/components/layout/system-status'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useMembership } from '@/hooks/use-data'
import { useAuth } from '@/providers/auth-context'
import { useTheme } from '@/providers/theme-context'

function HospitalName() {
  const { configured } = useAuth()
  const membership = useMembership()
  let name: ReactNode
  if (!configured) name = <span className="text-muted-foreground">Setup mode</span>
  else if (membership.isLoading) name = <Skeleton className="h-4 w-36" />
  else if (membership.data?.tenant) name = membership.data.tenant.name
  else name = <span className="text-muted-foreground">No hospital assigned</span>

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Building2 className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
      <span className="truncate font-heading text-sm font-semibold">{name}</span>
    </div>
  )
}

function UserMenu() {
  const { session, signOut } = useAuth()
  const membership = useMembership()
  if (!session) return null
  const email = session.user.email ?? 'Signed in'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account">
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary/10 font-heading text-xs font-bold text-primary uppercase dark:text-accent-foreground">
            {email.slice(0, 1)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="space-y-0.5 font-normal">
          <div className="truncate text-foreground">{membership.data?.full_name ?? email}</div>
          <div className="truncate text-xs text-muted-foreground">
            {email}
            {membership.data?.role && <span className="capitalize"> · {membership.data.role}</span>}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A primary action that exists in the shell but is switched on by a later phase. */
function PendingAction({ icon: Icon, label, hint, variant }: { icon: LucideIcon; label: string; hint: string; variant: 'default' | 'ai' }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* span wrapper: disabled buttons don't fire pointer events, so the tooltip needs a host */}
        <span tabIndex={0} aria-label={`${label} (${hint})`} className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          <Button
            size="sm"
            disabled
            variant={variant === 'ai' ? 'outline' : 'default'}
            className={variant === 'ai' ? 'pointer-events-none border-ai/30 text-ai dark:border-ai/30' : 'pointer-events-none'}
          >
            <Icon /> <span className="hidden xl:inline">{label}</span>
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {label} · {hint}
      </TooltipContent>
    </Tooltip>
  )
}

interface TopbarProps {
  onOpenMobileNav: () => void
  onOpenCommand: () => void
  onOpenTestCall: () => void
}

export function Topbar({ onOpenMobileNav, onOpenCommand, onOpenTestCall }: TopbarProps) {
  const { resolvedTheme, toggleTheme } = useTheme()
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMobileNav} aria-label="Open navigation">
        <Menu />
      </Button>

      <HospitalName />
      <div className="hidden h-5 w-px bg-border md:block" />
      <IstClock className="hidden md:flex" />

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={onOpenCommand}
          className="hidden h-8 items-center gap-2 rounded-md border bg-card px-2.5 text-[13px] text-muted-foreground shadow-soft transition-colors hover:text-foreground sm:inline-flex"
        >
          <Search className="size-3.5" />
          <span className="hidden xl:inline">Jump to…</span>
          <kbd className="rounded border bg-muted px-1 font-mono text-[10px] font-medium whitespace-nowrap">{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
        <Button variant="ghost" size="icon" className="sm:hidden" onClick={onOpenCommand} aria-label="Search">
          <Search />
        </Button>

        <SystemStatus />

        <PendingAction icon={Sparkles} label="Ask CareVoice" hint="arrives with the Console agent" variant="ai" />
        <Button size="sm" onClick={onOpenTestCall}>
          <PhoneCall /> <span className="hidden xl:inline">Test Call</span>
        </Button>

        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}>
          {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
        </Button>
        <UserMenu />
      </div>
    </header>
  )
}
