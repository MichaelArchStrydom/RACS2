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
 * JavaScript's setUTCHours normalises negative values automatically, so
 * times that cross midnight (e.g. 07:00 NZ = -5 UTC hours on that date)
 * roll back to the previous UTC day, which is the correct stored value.
 */
export function setNZHours(date: Date, hours: number, minutes: number): Date {
  const offset = getNZOffsetHours(date)
  const result = new Date(date)
  result.setUTCHours(hours - offset, minutes, 0, 0)
  return result
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
