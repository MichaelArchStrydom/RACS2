import { setNZHours } from './timezone'

export const TIME_RANGE_INVALID_MESSAGE = 'Time range not possible'

/**
 * Parses "HH:MM" start/end strings into real Date instants, anchored to the
 * NZ calendar day of `anchorDate` and rolling over to the next day if the
 * parsed end is not after the parsed start — the same overnight-shift
 * convention used throughout the roster (17:30 -> 07:00 spans midnight).
 * Returns null for unparseable input rather than an Invalid Date, so callers
 * can't accidentally compare against NaN.
 */
export function parseTimeRangeOnDay(
  anchorDate: Date,
  startStr: string,
  endStr: string
): { start: Date; end: Date } | null {
  const [sh, sm] = startStr.split(':').map(Number)
  const [eh, em] = endStr.split(':').map(Number)
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null

  const start = setNZHours(new Date(anchorDate), sh, sm)
  const end = setNZHours(new Date(anchorDate), eh, em)
  if (end.getTime() <= start.getTime()) {
    end.setTime(end.getTime() + 24 * 60 * 60 * 1000)
  }
  return { start, end }
}

/**
 * True if [start, end] falls entirely within [boundStart, boundEnd] — i.e.
 * within the actual shift/request's real window, never extending past it.
 * This is what stops someone typing e.g. "9:00" as an end time for a shift
 * that actually ends at 07:00 and having it silently roll over a whole day
 * past the real shift end.
 */
export function isWithinRange(start: Date, end: Date, boundStart: Date, boundEnd: Date): boolean {
  return (
    start.getTime() >= boundStart.getTime() &&
    end.getTime() <= boundEnd.getTime() &&
    start.getTime() < end.getTime()
  )
}
