import { formatNZTime, setNZHours } from './timezone'

export const SNAP_MINUTES = 30

export function snapToHalfHour(date: Date): Date {
  const [h, m] = formatNZTime(date).split(':').map(Number)
  const snapped = Math.round((h * 60 + m) / SNAP_MINUTES) * SNAP_MINUTES

  const dayOffsetMs = Math.floor(snapped / 1440) * 86_400_000
  const wrappedMinutes = ((snapped % 1440) + 1440) % 1440

  return setNZHours(
    new Date(date.getTime() + dayOffsetMs),
    Math.floor(wrappedMinutes / 60),
    wrappedMinutes % 60
  )
}
