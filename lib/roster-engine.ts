import { db } from './db'
import { setNZHours, nzMidnightUTC, addDaysToDateString } from './timezone'

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

    // Weekday from the calendar date itself (UTC-anchored), not currentDay.getDay()
    // which would depend on the server's local timezone.
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    const isWeekend = weekday === 0 || weekday === 6

    // FIX: setNZHours() converts an NZ wall-clock time to the correct UTC
    // instant regardless of server timezone. The previous code misused
    // toZonedTime() (which converts UTC → zoned display time, the reverse
    // direction), so shift times were stored 12-13h wrong on Vercel (UTC).
    const shiftStart = isWeekend
      ? setNZHours(currentDay, 7, 0)
      : setNZHours(currentDay, 17, 30)

    // shiftEnd is always 07:00 NZ on the next calendar day.
    const nextDayStr = addDaysToDateString(dateStr, 1)
    const shiftEnd = setNZHours(nzMidnightUTC(nextDayStr), 7, 0)

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

      // Extract specific roles to guarantee filling the seats
      let availableMembers = [...crew.members]
      const extract = (condition: (m: any) => boolean) => {
        const index = availableMembers.findIndex(condition)
        if (index !== -1) return availableMembers.splice(index, 1)[0]
        return null
      }

      const lineup = [
        { role: 'OIC', member: extract(m => m.qualifications.some((mq: any) => mq.qualification?.key === 'SO_QUALIFIED')) || extract(() => true) },
        { role: 'Driver', member: extract(m => m.qualifications.some((mq: any) => mq.qualification?.key === 'PUMP_OP')) || extract(() => true) },
        { role: 'FF1', member: extract(() => true) },
        { role: 'FF2', member: extract(() => true) },
        { role: 'FF3', member: extract(() => true) }
      ].filter(item => item.member !== null)

      // Create assignments for this specific truck
      for (const seat of lineup) {
        await db.shiftAssignment.create({
          data: {
            slotId: slot.id,
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

    // Generate both trucks
    await assignTruckLineup(activeCrew, '1st Due')
    await assignTruckLineup(backupCrew, '2nd Due')
  }

  return { success: true, message: `Successfully generated ${daysToGenerate} days.` }
}
