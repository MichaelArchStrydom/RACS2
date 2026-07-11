/**
 * lib/timezone.ts
 *
 * New Zealand timezone utilities. All shift times in this app are NZ local time
 * (NZST UTC+12 in winter, NZDT UTC+13 in summer). This module handles the
 * conversion so the app works correctly whether it runs on a NZ server or a
 * UTC cloud host like Vercel.
 */

export const NZ_TZ = 'Pacific/Auckland'

/**
 * Get the NZ timezone offset in hours for a specific instant.
 * Returns 12 during NZST (winter) and 13 during NZDT (summer DST).
 *
 * Uses Intl.DateTimeFormat to reconstruct the NZ local datetime from a UTC
 * instant, then computes the difference — this handles DST correctly without
 * any hardcoded tables.
 */
export function getNZOffsetHours(date: Date): number {
  const fmt = new Intl.DateTimeFormat('en', {
    timeZone: NZ_TZ,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  })

  const parts = Object.fromEntries(
    fmt.formatToParts(date).map(p => [p.type, p.value])
  )

  // hour can be "24" for midnight in some locales — treat as 0
  const hour = parts.hour === '24' ? 0 : parseInt(parts.hour)

  const nzAsUtcMs = Date.UTC(
    parseInt(parts.year),
    parseInt(parts.month) - 1,
    parseInt(parts.day),
    hour,
    parseInt(parts.minute),
    parseInt(parts.second)
  )

  return Math.round((nzAsUtcMs - date.getTime()) / 3_600_000)
}

/**
 * Set hours and minutes on a Date object treating them as NZ local time,
 * regardless of which timezone the server is running in.
 *
 * Returns a NEW Date — does not mutate the original.
 *
 */
export function setNZHours(date: Date, hours: number, minutes: number): Date {
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: NZ_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const parts = Object.fromEntries(
    dateFmt.formatToParts(date).map(p => [p.type, p.value])
  )
  const y = parseInt(parts.year)
  const m = parseInt(parts.month)
  const d = parseInt(parts.day)

  const offset = getNZOffsetHours(date)
  return new Date(Date.UTC(y, m - 1, d, hours - offset, minutes, 0, 0))
}

/**
 * Format a Date as "HH:MM" in the NZ timezone (24-hour, no AM/PM).
 * Use this instead of toLocaleTimeString() without a timezone wherever
 * the code runs on a non-NZ server (e.g. Vercel UTC).
 */
export function formatNZTime(date: Date): string {
  return new Date(date).toLocaleTimeString('en-NZ', {
    timeZone: NZ_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Today's calendar date in NZ, as "YYYY-MM-DD" — independent of the server's
 * own timezone (so "today" on a UTC host still matches NZ wall-clock date).
 */
export function todayNZDateString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: NZ_TZ })
}

/**
 * Shift a "YYYY-MM-DD" calendar date string by `days` (may be negative).
 * Pure calendar arithmetic done via UTC getters/setters as a neutral
 * calendar — never tied to NZ or server wall-clock time — so it can't be
 * thrown off by DST or by which timezone the server happens to run in.
 */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/**
 * Convert a "YYYY-MM-DD" NZ calendar date into the exact UTC instant of
 * midnight (00:00) on that date in NZ time — correct across the DST
 * boundary regardless of what timezone the server runs in.
 */
export function nzMidnightUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const guess = new Date(Date.UTC(y, m - 1, d))
  return setNZHours(guess, 0, 0)
}

/**
 * Shift a "YYYY-MM" calendar month string by `delta` months (may be negative).
 * Same neutral UTC-anchored approach as addDaysToDateString.
 */
export function addMonthsToMonthString(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Every "YYYY-MM-DD" date string for the calendar-grid view of a month:
 * the full weeks (Sun-Sat) spanning that month, including the leading/
 * trailing days borrowed from the adjacent months so the grid is always a
 * whole number of 7-day rows.
 */
export function getMonthGridDateStrings(monthStr: string): string[] {
  const [y, m] = monthStr.split('-').map(Number)

  const firstOfMonth = new Date(Date.UTC(y, m - 1, 1))
  const gridStart = new Date(Date.UTC(y, m - 1, 1 - firstOfMonth.getUTCDay()))

  const lastOfMonth = new Date(Date.UTC(y, m, 0)) // day 0 of next month = last day of this one
  const gridEnd = new Date(Date.UTC(y, m, 0 + (6 - lastOfMonth.getUTCDay())))

  const days: string[] = []
  for (let t = gridStart.getTime(); t <= gridEnd.getTime(); t += 86_400_000) {
    const dt = new Date(t)
    days.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`)
  }
  return days
}

/**
 * Best-effort normalisation for a manually-typed "HH:MM" time field: if the
 * user only typed the hour ("7" or "17"), pad it and append ":00" so they
 * don't have to type the full "07:00". Anything else — already has a colon,
 * empty, or not a valid 0-23 hour — is left untouched.
 */
export function normalizeTimeInput(raw: string): string {
  const trimmed = raw.trim()
  if (/^\d{1,2}$/.test(trimmed)) {
    const hour = parseInt(trimmed, 10)
    if (hour >= 0 && hour <= 23) {
      return `${trimmed.padStart(2, '0')}:00`
    }
  }
  return raw
}
