import { useEffect, useState } from 'react'

import { HOSPITAL_TZ } from '@/lib/time'
import { cn } from '@/lib/utils'

const timeFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: HOSPITAL_TZ,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})
const dateFmt = new Intl.DateTimeFormat('en-IN', { timeZone: HOSPITAL_TZ, weekday: 'short', day: 'numeric', month: 'short' })

export function IstClock({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className={cn('flex shrink-0 items-baseline gap-2 leading-none whitespace-nowrap', className)} title="India Standard Time (Asia/Kolkata)">
      <span className="hidden text-xs whitespace-nowrap text-muted-foreground xl:inline">{dateFmt.format(now)}</span>
      <time dateTime={now.toISOString()} className="font-mono text-[13px] font-medium tabular">
        {timeFmt.format(now)}
      </time>
      <span className="font-mono text-[10px] font-medium tracking-wider text-muted-foreground">IST</span>
    </div>
  )
}
