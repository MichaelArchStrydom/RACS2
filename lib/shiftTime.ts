import { setNZHours, formatNZTime } from './timezone'

export const TIME_RANGE_INVALID_MESSAGE = 'Time range not possible'

const DAY_MS = 24 * 60 * 60 * 1000

function nzMinutesOfDay(date: Date): number {
  const [h, m] = formatNZTime(date).split(':').map(Number)
  return h * 60 + m
}

export function parseTimeRangeOnDay(
  anchorDate: Date,
  startStr: string,
  endStr: string
): { start: Date; end: Date } | null {
  const [sh, sm] = startStr.split(':').map(Number)
  const [eh, em] = endStr.split(':').map(Number)
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null

  const anchorMinutes = nzMinutesOfDay(anchorDate)
  const startOffsetDays = sh * 60 + sm < anchorMinutes ? 1 : 0
  const endOffsetDays = eh * 60 + em < anchorMinutes ? 1 : 0

  const start = setNZHours(new Date(anchorDate.getTime() + startOffsetDays * DAY_MS), sh, sm)
  let end = setNZHours(new Date(anchorDate.getTime() + endOffsetDays * DAY_MS), eh, em)

  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + DAY_MS)
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
