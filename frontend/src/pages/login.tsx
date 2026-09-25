import { motion } from 'framer-motion'
import { Loader2, Moon, Sun } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

import { BrandMark, BrandWordmark } from '@/components/layout/brand'
import { LanguageChip, LiveWaveform } from '@/components/signature'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/providers/auth-context'
import { useTheme } from '@/providers/theme-context'

export default function LoginPage() {
  const { session, configured, signIn } = useAuth()
  const { resolvedTheme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to={from} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative grid min-h-dvh lg:grid-cols-2">
      <Button variant="ghost" size="icon" className="absolute top-4 right-4 z-10" onClick={toggleTheme} aria-label="Toggle theme">
        {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
      </Button>

      <div className="relative hidden overflow-hidden border-r bg-card lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="pointer-events-none absolute -top-32 -left-32 size-[480px] rounded-full bg-primary/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-40 size-[420px] rounded-full bg-ai/10 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <BrandMark />
          <BrandWordmark className="text-base" />
        </div>
        <div className="relative max-w-md space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border bg-background/60 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
            <LiveWaveform bars={5} className="h-3" />
            Voice operations, live
          </div>
          <h1 className="font-heading text-4xl leading-[1.1] font-bold tracking-tight">
            Mission control for your hospital’s phone lines.
          </h1>
          <p className="text-muted-foreground">
            AI agents answer, book and follow up with patients in their own language — your staff see every call as it happens.
          </p>
          <div className="flex gap-1.5">
            <LanguageChip lang="te" showNative />
            <LanguageChip lang="hi" showNative />
            <LanguageChip lang="en" />
          </div>
        </div>
        <p className="relative text-xs text-muted-foreground">Agents never diagnose or prescribe. Every action is checked by policy.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="w-full max-w-sm space-y-6">
          <div className="flex items-center gap-2.5 lg:hidden">
            <BrandMark />
            <BrandWordmark className="text-base" />
          </div>
          <div className="space-y-1.5">
            <h2 className="font-heading text-2xl font-bold tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground">Use your hospital staff account.</p>
          </div>

          {!configured && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-[13px] text-warning-foreground dark:text-warning">
              Supabase isn’t configured yet. Add <code className="font-mono text-xs">VITE_SUPABASE_URL</code> and{' '}
              <code className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code> to <code className="font-mono text-xs">frontend/.env</code>, then restart{' '}
              <code className="font-mono text-xs">npm run dev</code>.
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={!configured} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!configured}
                className="h-10"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-critical">
                {error}
              </p>
            )}
            <Button type="submit" className="h-10 w-full" disabled={!configured || submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              Sign in
            </Button>
          </form>
        </motion.div>
      </div>
    </div>
  )
}
