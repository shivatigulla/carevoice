/** All timestamps are stored in UTC and displayed in the hospital's time zone. */
export const HOSPITAL_TZ = 'Asia/Kolkata'

const IST_OFFSET_MS = 330 * 60 * 1000 // IST is UTC+05:30 with no DST
const DAY_MS = 24 * 60 * 60 * 1000

/** UTC instant of IST midnight, `offsetDays` from today (0 = today, -1 = yesterday). */
export function istDayStart(offsetDays = 0, now = Date.now()): Date {
  const istMidnight = Math.floor((now + IST_OFFSET_MS) / DAY_MS) * DAY_MS
  return new Date(istMidnight - IST_OFFSET_MS + offsetDays * DAY_MS)
}

const timeFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: HOSPITAL_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: HOSPITAL_TZ,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

export function formatTime(value: string | Date): string {
  return timeFmt.format(new Date(value))
}

export function formatDateTime(value: string | Date): string {
  return dateTimeFmt.format(new Date(value))
}

export function formatRelative(value: string | Date, now = Date.now()): string {
  const diff = Math.round((now - new Date(value).getTime()) / 1000)
  if (diff < 45) return 'just now'
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return formatDateTime(value)
}

/** 83 -> "01:23", 3725 -> "1:02:05" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
