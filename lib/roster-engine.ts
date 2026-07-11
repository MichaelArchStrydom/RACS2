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

// Shift start/end for a given NZ calendar date: weekends run 07:00-07:00,
// weekdays run 17:30-07:00 (always ending 07:00 NZ the next calendar day).

export function getShiftTimesForDate(dateStr: string, isWeekend: boolean): { shiftStart: Date; shiftEnd: Date } {
  const currentDay = nzMidnightUTC(dateStr)
  const shiftStart = isWeekend
    ? setNZHours(currentDay, 7, 0)
    : setNZHours(currentDay, 17, 30)

  const nextDayStr = addDaysToDateString(dateStr, 1)
  const shiftEnd = setNZHours(nzMidnightUTC(nextDayStr), 7, 0)

  return { shiftStart, shiftEnd }
}

// Fills OIC/Driver/FF1-3 seats from a crew's members, preferring qualified
// members for OIC (SO_QUALIFIED) and Driver (PUMP_OP) before falling back to
// whoever's left. Returns only seats that could actually be filled.
export function buildSeatLineup(crew: any): { role: string; member: any }[] {
  let availableMembers = [...crew.members]
  const extract = (condition: (m: any) => boolean) => {
    const index = availableMembers.findIndex(condition)
    if (index !== -1) return availableMembers.splice(index, 1)[0]
    return null
  }

  return [
    { role: 'OIC', member: extract(m => m.qualifications.some((mq: any) => mq.qualification?.key === 'SO_QUALIFIED')) || extract(() => true) },
    { role: 'Driver', member: extract(m => m.qualifications.some((mq: any) => mq.qualification?.key === 'PUMP_OP')) || extract(() => true) },
    { role: 'FF1', member: extract(() => true) },
    { role: 'FF2', member: extract(() => true) },
    { role: 'FF3', member: extract(() => true) }
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
    include: {
      members: {
        include: {
          qualifications: {
            include: {
              qualification: true
            }
          }
        }
      }
    },
    orderBy: { crewOrder: 'asc' }
  })

  if (crews.length === 0) throw new Error("No crews found in the database. Please seed first.")

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

    const assignedCrewIndex = Math.abs(dayIndex % crews.length)
    const backupCrewIndex = (assignedCrewIndex + 1) % crews.length

    const activeCrew = crews[assignedCrewIndex]
    const backupCrew = crews[backupCrewIndex]

    const isWeekend = isWeekendDate(dateStr)
    const { shiftStart, shiftEnd } = getShiftTimesForDate(dateStr, isWeekend)

    // Helper function to pull the right people for the seats
    const assignTruckLineup = async (crew: any, applianceName: string) => {
      const slot = await db.shiftSlot.create({
        data: {
          date: currentDay,
          appliance: applianceName,
          roleRequired: 'Full Crew',
          isWeekend
        }
      })

      await createAssignmentsForSlot(slot.id, crew, shiftStart, shiftEnd)
    }

    // Generate both trucks
    await assignTruckLineup(activeCrew, '1st Due')
    await assignTruckLineup(backupCrew, '2nd Due')
  }

  return { success: true, message: `Successfully generated ${daysToGenerate} days.` }
}
