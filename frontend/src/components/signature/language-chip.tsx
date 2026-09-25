import type { Language } from '@/lib/agents'
import { cn } from '@/lib/utils'

const LANGS: Record<Language, { code: string; name: string; native: string; className: string }> = {
  te: { code: 'TE', name: 'Telugu', native: 'తెలుగు', className: 'bg-primary/10 text-primary ring-primary/20 dark:text-accent-foreground' },
  hi: { code: 'HI', name: 'Hindi', native: 'हिन्दी', className: 'bg-warning/15 text-warning-foreground ring-warning/30 dark:text-warning' },
  en: { code: 'EN', name: 'English', native: 'English', className: 'bg-ai/10 text-ai ring-ai/20' },
}

interface LanguageChipProps {
  lang: Language | string
  /** Show the language's own script name (e.g. తెలుగు) next to the code. */
  showNative?: boolean
  className?: string
}

export function LanguageChip({ lang, showNative = false, className }: LanguageChipProps) {
  const l = LANGS[lang as Language]
  if (!l) return null
  return (
    <span
      title={l.name}
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-md px-1.5 font-mono text-[10px] font-medium tracking-wide ring-1 ring-inset',
        l.className,
        className,
      )}
    >
      {l.code}
      {showNative && (
        <span lang={lang} className="font-sans text-[11px] font-medium tracking-normal">
          {l.native}
        </span>
      )}
    </span>
  )
}
