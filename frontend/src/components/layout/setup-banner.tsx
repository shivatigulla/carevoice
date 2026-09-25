import { Wrench } from 'lucide-react'

import { useAuth } from '@/providers/auth-context'

/** Shown only when frontend/.env has no Supabase keys, so the shell can still be explored. */
export function SetupBanner() {
  const { configured } = useAuth()
  if (configured) return null
  return (
    <div className="border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-[13px] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1440px] items-center gap-2.5">
        <Wrench className="size-4 shrink-0 text-warning-foreground dark:text-warning" />
        <p className="text-warning-foreground dark:text-warning">
          <span className="font-semibold">Setup mode.</span> Supabase isn't configured, so no data can load. Add{' '}
          <code className="font-mono text-xs">VITE_SUPABASE_URL</code> and <code className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code> to{' '}
          <code className="font-mono text-xs">frontend/.env</code> — see README.md.
        </p>
      </div>
    </div>
  )
}
