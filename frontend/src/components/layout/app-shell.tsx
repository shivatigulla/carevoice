import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { CommandPalette } from '@/components/layout/command-palette'
import { SetupBanner } from '@/components/layout/setup-banner'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { TestCallSheet } from '@/components/test-call/test-call-sheet'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { queryKeys } from '@/hooks/use-data'
import { useRealtimeInvalidate } from '@/hooks/use-realtime'
import { cn } from '@/lib/utils'

const COLLAPSE_KEY = 'carevoice-sidebar-collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export function AppShell() {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [testCallOpen, setTestCallOpen] = useState(false)

  // Calls drive the sidebar badge and dashboard, so the shell owns this subscription.
  useRealtimeInvalidate('calls', [queryKeys.liveCalls, queryKeys.kpis])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      } catch {
        /* ignore */
      }
      return !c
    })
  }, [])

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        className={cn('hidden shrink-0 border-r border-sidebar-border transition-[width] duration-200 ease-out lg:flex', collapsed ? 'w-[68px]' : 'w-[248px]')}
      />

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[264px] p-0 sm:max-w-[264px]" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Main navigation</SheetDescription>
          <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobileNav={() => setMobileOpen(true)} onOpenCommand={() => setCommandOpen(true)} onOpenTestCall={() => setTestCallOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <SetupBanner />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <TestCallSheet open={testCallOpen} onOpenChange={setTestCallOpen} />
    </div>
  )
}
