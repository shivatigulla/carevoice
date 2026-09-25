import { QueryClientProvider } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'

import { AppShell } from '@/components/layout/app-shell'
import { BrandMark } from '@/components/layout/brand'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { queryClient } from '@/lib/query-client'
import AgentsPage from '@/pages/agents'
import AppointmentsPage from '@/pages/appointments'
import DashboardPage from '@/pages/dashboard'
import DoctorsPage from '@/pages/doctors'
import LoginPage from '@/pages/login'
import NotFoundPage from '@/pages/not-found'
import PatientsPage from '@/pages/patients'
import { SectionPage } from '@/pages/section-page'
import { useAuth } from '@/providers/auth-context'
import { AuthProvider } from '@/providers/auth-provider'
import { ThemeProvider } from '@/providers/theme-provider'

// Dev-only component gallery; import.meta.env.DEV is false in production builds, so it is dropped.
const DesignPreviewPage = import.meta.env.DEV ? lazy(() => import('@/pages/design-preview')) : null

/** Requires a Supabase session. In setup mode (no Supabase keys) the shell stays explorable. */
function RequireAuth() {
  const { session, loading, configured } = useAuth()
  const location = useLocation()
  if (!configured) return <Outlet />
  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <BrandMark />
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider delayDuration={200}>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<RequireAuth />}>
                  <Route element={<AppShell />}>
                    <Route index element={<DashboardPage />} />
                    <Route path="live-calls" element={<SectionPage section="liveCalls" />} />
                    <Route path="agents" element={<AgentsPage />} />
                    <Route path="patients" element={<PatientsPage />} />
                    <Route path="doctors" element={<DoctorsPage />} />
                    <Route path="appointments" element={<AppointmentsPage />} />
                    <Route path="follow-ups" element={<SectionPage section="followUps" />} />
                    <Route path="tasks" element={<SectionPage section="tasks" />} />
                    <Route path="escalations" element={<SectionPage section="escalations" />} />
                    <Route path="call-records" element={<SectionPage section="callRecords" />} />
                    <Route path="analytics" element={<SectionPage section="analytics" />} />
                    <Route path="knowledge" element={<SectionPage section="knowledge" />} />
                    <Route path="workflows" element={<SectionPage section="workflows" />} />
                    <Route path="settings" element={<SectionPage section="settings" />} />
                    {DesignPreviewPage && (
                      <Route
                        path="design"
                        element={
                          <Suspense fallback={null}>
                            <DesignPreviewPage />
                          </Suspense>
                        }
                      />
                    )}
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Route>
              </Routes>
            </BrowserRouter>
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
