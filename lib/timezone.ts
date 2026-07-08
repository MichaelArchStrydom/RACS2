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
 * Example:
 *   setNZHours(new Date('2024-07-01T00:00:00Z'), 17, 30)
 *   → new Date('2024-07-01T05:30:00Z')  (= 17:30 NZST)
 *
 * FIX: the result is built from the NZ CALENDAR DATE that `date` represents
 * (via Intl formatting), not from `date`'s own UTC calendar day. Those two
 * disagree whenever `date`'s NZ-local hour is earlier than the NZ offset
 * (e.g. any early-morning NZ instant — 07:00 shift starts, or NZ-midnight
 * anchors like nzMidnightUTC()) — in that regime the previous implementation
 * (clone + setUTCHours) silently anchored on the wrong day and produced a
 * result 24h too early. Building from the NZ date string sidesteps that.
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
