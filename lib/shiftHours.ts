import { setNZHours, nzMidnightUTC, addDaysToDateString } from './timezone'

export function isWeekendDate(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return weekday === 0 || weekday === 6
}

export interface ApplianceShiftHours {
  weekdayShiftStart: string
  weekdayShiftEnd: string
  weekendShiftStart: string
  weekendShiftEnd: string
}

export const DEFAULT_SHIFT_HOURS: ApplianceShiftHours = {
  weekdayShiftStart: '17:30',
  weekdayShiftEnd: '07:00',
  weekendShiftStart: '07:00',
  weekendShiftEnd: '07:00',
}

export function getShiftTimesForDate(
  dateStr: string,
  isWeekend: boolean,
  hours: ApplianceShiftHours = DEFAULT_SHIFT_HOURS
): { shiftStart: Date; shiftEnd: Date } {
  const [startStr, endStr] = isWeekend
    ? [hours.weekendShiftStart, hours.weekendShiftEnd]
    : [hours.weekdayShiftStart, hours.weekdayShiftEnd]
  const [sh, sm] = startStr.split(':').map(Number)
  const [eh, em] = endStr.split(':').map(Number)

  const currentDay = nzMidnightUTC(dateStr)
  const shiftStart = setNZHours(currentDay, sh, sm)

  let shiftEnd = setNZHours(currentDay, eh, em)
  if (shiftEnd.getTime() <= shiftStart.getTime()) {
    shiftEnd = setNZHours(nzMidnightUTC(addDaysToDateString(dateStr, 1)), eh, em)
  }

  return { shiftStart, shiftEnd }
}
