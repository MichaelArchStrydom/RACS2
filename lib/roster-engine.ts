import { db } from './db'
import type { Prisma } from '@prisma/client'
import { setNZHours, nzMidnightUTC, addDaysToDateString } from './timezone'

// Whether a given NZ calendar date falls on a weekend, derived purely from
// the date string itself (UTC-anchored) — independent of server timezone.
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

// Matches Appliance's schema defaults, the hours every appliance used
// before shift hours became configurable per-appliance.
export const DEFAULT_SHIFT_HOURS: ApplianceShiftHours = {
  weekdayShiftStart: '17:30',
  weekdayShiftEnd: '07:00',
  weekendShiftStart: '07:00',
  weekendShiftEnd: '07:00',
}

// Shift start/end 
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

export function getCrewIndicesForDay(dayIndex: number, crewCount: number): { assignedCrewIndex: number; backupCrewIndex: number | null } {
  const assignedCrewIndex = Math.abs(dayIndex % crewCount)
  // With only one crew, (assignedCrewIndex + 1) % crewCount wraps back to the
  // same index — there is no distinct second crew to back it up, so callers
  // must not seat it onto a second truck too (that would double-book the
  // same members onto two simultaneous shifts and double-count their hours).
  const backupCrewIndex = crewCount > 1 ? (assignedCrewIndex + 1) % crewCount : null
  return { assignedCrewIndex, backupCrewIndex }
}

export function epochDayIndex(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / (1000 * 60 * 60 * 24))
}

export async function getMonthlyRosteredHours(memberId: string, memberCrewId: string | null, monthStr: string): Promise<number> {
  if (!memberCrewId) return 0

  // Stable secondary sort on id — if two crews ever share the same
  // crewOrder value (nothing prevents that), Postgres doesn't guarantee
  // consistent tie-break ordering across separate queries, which could
  // otherwise make this function disagree with generateRosterForDateRange
  // about which crew is "assigned" vs "backup" for a given day.

  const crews = await db.crew.findMany({
    where: { isActive: true },
    include: {
      members: {
        where: { isActive: true },
        include: { qualifications: { include: { qualification: true } } }
      }
    },
    orderBy: [{ crewOrder: 'asc' }, { id: 'asc' }]
  })
  const memberCrewIndex = crews.findIndex(c => c.id === memberCrewId)
  if (memberCrewIndex === -1) return 0
  const crew = crews[memberCrewIndex]

  // Projected (not generated) days need to know which appliance's hours
  const [firstDue, secondDue] = await Promise.all([
    db.appliance.findUnique({ where: { name: '1st Due' } }),
    db.appliance.findUnique({ where: { name: '2nd Due' } }),
  ])

  const [y, m] = monthStr.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const monthStartStr = `${monthStr}-01`
  const monthEndStr = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`
  const rangeStart = nzMidnightUTC(monthStartStr)
  const rangeEnd = nzMidnightUTC(addDaysToDateString(monthEndStr, 1))

  const [generatedSlots, realAssignments] = await Promise.all([
    db.shiftSlot.findMany({ where: { date: { gte: rangeStart, lt: rangeEnd } }, select: { date: true } }),
    db.shiftAssignment.findMany({
      where: { memberId, slot: { date: { gte: rangeStart, lt: rangeEnd } } },
      select: { startTime: true, endTime: true }
    }),
  ])

  const generatedDateKeys = new Set(
    generatedSlots.map(s => new Date(s.date).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' }))
  )

  let totalHours = realAssignments.reduce(
    (sum, a) => sum + (a.endTime.getTime() - a.startTime.getTime()) / (1000 * 60 * 60),
    0
  )

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (generatedDateKeys.has(dateStr)) continue // real data already summed above

    const dayIndex = Math.floor(Date.UTC(y, m - 1, day) / (1000 * 60 * 60 * 24))
    const { assignedCrewIndex, backupCrewIndex } = getCrewIndicesForDay(dayIndex, crews.length)
    if (memberCrewIndex !== assignedCrewIndex && memberCrewIndex !== backupCrewIndex) continue

    const lineup = buildSeatLineup(crew)
    if (lineup.some(seat => seat.member.id === memberId)) {
      const appliance = memberCrewIndex === assignedCrewIndex ? firstDue : secondDue
      const { shiftStart, shiftEnd } = getShiftTimesForDate(dateStr, isWeekendDate(dateStr), appliance ?? undefined)
      totalHours += (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60 * 60)
    }
  }

  return totalHours
}

export const APPLIANCE_ROLES = ['OIC', 'Driver', 'FF1', 'FF2', 'FF3'] as const

// Fills OIC/Driver/FF1-3 seats from a crew's members. OIC and Driver are
// qualification-gated with no fallback — better an empty seat than someone
// unqualified put in charge or behind the wheel. Recruits (rank RCFF) are
// reserved for FF3 only, never OIC/Driver/FF1/FF2, so if FF3 is already taken
// by another recruit, any extra recruit simply doesn't get seated that day
// rather than sliding into a seat they shouldn't hold.
//
// This gating is deliberately scoped to roster GENERATION only (this
// function and its two callers below). Cover-request acceptance
// intentionally stays unrestricted anyone can pick up
// any shift, with admins/mods as the manual backstop if quals are wrong.
export function buildSeatLineup(crew: any): { role: string; member: any }[] {
  let availableMembers = [...crew.members]
  const extract = (condition: (m: any) => boolean) => {
    const index = availableMembers.findIndex(condition)
    if (index !== -1) return availableMembers.splice(index, 1)[0]
    return null
  }

  const isRecruit = (m: any) => m.rank === 'RCFF'

  const isOfficerQualified = (m: any) => !isRecruit(m) && m.qualifications.some((mq: any) => mq.qualification?.key === 'SO_QUALIFIED')
  const isDriverQualified = (m: any) => !isRecruit(m) && m.qualifications.some((mq: any) => mq.qualification?.key === 'PUMP_OP')

  const oic = extract(isOfficerQualified)
  const driver = extract(isDriverQualified)
  // Pull a recruit out of the pool now so FF1/FF2 can't claim them ahead of
  // FF3 but hold them aside rather than seating them immediately, so a
  // crew with no recruit still fills FF1 then FF2 in order before FF3.
  const reservedRecruit = extract(isRecruit)
  const ff1 = extract(m => !isRecruit(m))
  const ff2 = extract(m => !isRecruit(m))
  const ff3 = reservedRecruit || extract(() => true)

  return [
    { role: 'OIC', member: oic },
    { role: 'Driver', member: driver },
    { role: 'FF1', member: ff1 },
    { role: 'FF2', member: ff2 },
    { role: 'FF3', member: ff3 }
  ].filter(item => item.member !== null)
}

// Creates one ShiftAssignment per filled seat for a crew on an existing slot.
// `client` defaults to the plain db handle but can be a $transaction client
// so callers can bundle this with other writes atomically.
export async function createAssignmentsForSlot(
  slotId: string,
  crew: any,
  shiftStart: Date,
  shiftEnd: Date,
  client: Prisma.TransactionClient = db
) {
  const lineup = buildSeatLineup(crew)
  for (const seat of lineup) {
    await client.shiftAssignment.create({
      data: {
        slotId,
        applianceRole: seat.role,
        memberId: seat.member.id,
        startTime: shiftStart,
        endTime: shiftEnd,
        historicalRank: seat.member.rank,
        historicalWatchName: crew.watchName
      }
    })
  }
}

export async function generateRosterForDateRange(startDateStr: string, daysToGenerate: number) {
  const crews = await db.crew.findMany({
    where: { isActive: true },
    include: {
      members: {
        where: { isActive: true },
        include: {
          qualifications: {
            include: {
              qualification: true
            }
          }
        }
      }
    },

    orderBy: [{ crewOrder: 'asc' }, { id: 'asc' }]
  })

  if (crews.length === 0) throw new Error("No crews found in the database. Please seed first.")

  // Each appliance's own configured hours — fetched once outside the
  const appliances = await db.appliance.findMany()
  const applianceHoursByName = new Map(appliances.map(a => [a.name, a]))

  // Wrapped in a transaction: a crash partway through a large bulk
  // generation (e.g. 90+ days) previously could leave some days with a
  // ShiftSlot but zero/partial ShiftAssignment rows (an OIC-less truck),
  // with no way to detect or repair it — now it's all-or-nothing.
  await db.$transaction(async (tx) => {
    for (let i = 0; i < daysToGenerate; i++) {
      const dateStr = addDaysToDateString(startDateStr, i)
      const [y, m, d] = dateStr.split('-').map(Number)

      // The UTC instant of NZ midnight on this calendar date — this is what
      // gets stored as ShiftSlot.date.
      const currentDay = nzMidnightUTC(dateStr)

      // Stable epoch-day number anchored to the calendar date itself (not the
      // server's local timezone) so crew rotation is deterministic regardless
      // of where this runs.
      const dayIndex = Math.floor(Date.UTC(y, m - 1, d) / (1000 * 60 * 60 * 24))

      const { assignedCrewIndex, backupCrewIndex } = getCrewIndicesForDay(dayIndex, crews.length)

      const activeCrew = crews[assignedCrewIndex]
      const backupCrew = backupCrewIndex !== null ? crews[backupCrewIndex] : null

      const isWeekend = isWeekendDate(dateStr)

      // Helper function to pull the right people for the seats
      const assignTruckLineup = async (crew: any, applianceName: string) => {
        const slot = await tx.shiftSlot.create({
          data: {
            date: currentDay,
            appliance: applianceName,
            roleRequired: 'Full Crew',
            isWeekend
          }
        })

        const { shiftStart, shiftEnd } = getShiftTimesForDate(dateStr, isWeekend, applianceHoursByName.get(applianceName))
        await createAssignmentsForSlot(slot.id, crew, shiftStart, shiftEnd, tx)
      }

      // Generate both trucks but with only one active crew, there's no
      // distinct backup, so only 1st Due gets generated for that day rather
      // than double-booking the same crew onto both trucks at once.
      await assignTruckLineup(activeCrew, '1st Due')
      if (backupCrew) {
        await assignTruckLineup(backupCrew, '2nd Due')
      }
    }
  }, { timeout: 30000 })

  return { success: true, message: `Successfully generated ${daysToGenerate} days.` }
}
