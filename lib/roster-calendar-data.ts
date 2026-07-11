import { db } from './db'
import { nzMidnightUTC, addDaysToDateString, getMonthGridDateStrings } from './timezone'
import type { MonthSlotsByDate, CalendarSlot } from '@/components/roster/RosterCalendarTypes'

// Shared between the initial server-rendered page load and the client-side
// month-navigation action, so both fetch/shape calendar data identically.
export async function getRosterCalendarSlotsByDate(monthStr: string): Promise<MonthSlotsByDate> {
  const gridDates = getMonthGridDateStrings(monthStr)
  const gridStart = nzMidnightUTC(gridDates[0])
  const gridEnd = nzMidnightUTC(addDaysToDateString(gridDates[gridDates.length - 1], 1))

  const slots = await db.shiftSlot.findMany({
    where: { date: { gte: gridStart, lt: gridEnd } },
    include: { assignments: { include: { member: true } } },
    orderBy: [{ date: 'asc' }, { appliance: 'asc' }],
  })

  const slotsByDate: MonthSlotsByDate = {}
  for (const slot of slots) {
    const dateKey = new Date(slot.date).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
    const watchNames = new Set(slot.assignments.map(a => a.historicalWatchName ?? null))
    const watchName = slot.assignments.length === 0 ? null : (watchNames.size === 1 ? [...watchNames][0] : null)

    const entry: CalendarSlot = {
      id: slot.id,
      appliance: slot.appliance,
      status: slot.status,
      watchName,
      assignments: slot.assignments.map(a => ({
        applianceRole: a.applianceRole,
        memberName: `${a.member.lastName}, ${a.member.firstName.charAt(0)}.`,
      })),
    }

    if (!slotsByDate[dateKey]) slotsByDate[dateKey] = []
    slotsByDate[dateKey].push(entry)
  }

  return slotsByDate
}
