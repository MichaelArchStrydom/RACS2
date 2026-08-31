import { db } from './db'
import type { Prisma } from '@prisma/client'
import { nzMidnightUTC, addDaysToDateString } from './timezone'

export { isWeekendDate, getShiftTimesForDate, DEFAULT_SHIFT_HOURS } from './shiftHours'
export type { ApplianceShiftHours } from './shiftHours'
import { isWeekendDate, getShiftTimesForDate } from './shiftHours'

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

function fillRemainingSeats(openRoles: readonly string[], pool: any[]): { role: string; member: any }[] {
  const available = [...pool]
  const extract = (condition: (m: any) => boolean) => {
    const index = available.findIndex(condition)
    if (index !== -1) return available.splice(index, 1)[0]
    return null
  }

  const isRecruit = (m: any) => m.rank === 'RCFF'
  const isOfficerQualified = (m: any) => !isRecruit(m) && m.qualifications.some((mq: any) => mq.qualification?.key === 'SO_QUALIFIED')
  const isDriverQualified = (m: any) => !isRecruit(m) && m.qualifications.some((mq: any) => mq.qualification?.key === 'PUMP_OP')

  const reservedRecruit = openRoles.includes('FF3') ? extract(isRecruit) : null

  const result: { role: string; member: any }[] = []
  for (const role of openRoles) {
    let member: any = null
    if (role === 'OIC') member = extract(isOfficerQualified)
    else if (role === 'Driver') member = extract(isDriverQualified)
    else if (role === 'FF1') member = extract((m) => !isRecruit(m))
    else if (role === 'FF2') member = extract((m) => !isRecruit(m))
    else if (role === 'FF3') member = reservedRecruit ?? extract(() => true)
    if (member) result.push({ role, member })
  }
  return result
}

export function buildSeatLineup(crew: any): { role: string; member: any }[] {
  const lineup: { role: string; member: any }[] = []
  const filledRoles = new Set<string>()

  for (let i = 0; i < APPLIANCE_ROLES.length; i++) {
    const member = crew.members.find((m: any) => m.seatPosition === i)
    if (member) {
      lineup.push({ role: APPLIANCE_ROLES[i], member })
      filledRoles.add(APPLIANCE_ROLES[i])
    }
  }

  const openRoles = APPLIANCE_ROLES.filter((r) => !filledRoles.has(r))
  const bench = crew.members.filter((m: any) => m.seatPosition == null)
  const fallback = fillRemainingSeats(openRoles, bench)

  return [...lineup, ...fallback].sort(
    (a, b) => APPLIANCE_ROLES.indexOf(a.role as any) - APPLIANCE_ROLES.indexOf(b.role as any)
  )
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
