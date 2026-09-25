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

const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: HOSPITAL_TZ, weekday: 'short' })
const dayLabelFmt = new Intl.DateTimeFormat('en-IN', { timeZone: HOSPITAL_TZ, weekday: 'short', day: 'numeric', month: 'short' })
const longDateFmt = new Intl.DateTimeFormat('en-IN', { timeZone: HOSPITAL_TZ, day: 'numeric', month: 'short', year: 'numeric' })
const hmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: HOSPITAL_TZ, hour: '2-digit', minute: '2-digit', hour12: false })

/** 'mon' … 'sun' for the IST calendar day containing `value`. */
export function istWeekdayKey(value: string | Date): 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' {
  return weekdayFmt.format(new Date(value)).toLowerCase().slice(0, 3) as ReturnType<typeof istWeekdayKey>
}

export function formatDayLabel(value: string | Date): string {
  return dayLabelFmt.format(new Date(value))
}

export function formatLongDate(value: string | Date): string {
  return longDateFmt.format(new Date(value))
}

/** 24h "HH:MM" in IST. */
export function formatHm(value: string | Date): string {
  return hmFmt.format(new Date(value))
}

/** Minutes since IST midnight for an instant. */
export function istMinutes(value: string | Date): number {
  const [h, m] = formatHm(value).split(':').map(Number)
  return h * 60 + m
}

/** "13:30" -> 810 */
export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

export function isSameIstDay(a: string | Date, b: string | Date): boolean {
  return longDateFmt.format(new Date(a)) === longDateFmt.format(new Date(b))
}

/** Whole years between a date-of-birth (YYYY-MM-DD) and today. */
export function ageFromDob(dob: string | null): number | null {
  if (!dob) return null
  const [y, m, d] = dob.split('-').map(Number)
  const now = new Date()
  let age = now.getFullYear() - y
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--
  return age
}

/** "+919876543210" -> "+91 98765 43210" */
export function formatPhone(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164)
  return m ? `+91 ${m[1]} ${m[2]}` : e164
}
