import { db } from './db'
import { setNZHours } from './timezone'

export async function generateRosterForDateRange(startDate: Date, daysToGenerate: number) {
  const crews = await db.crew.findMany({
    include: {
      members: {
        include: {
          qualifications: {
            include: { qualification: true }
          }
        }
      }
    },
    orderBy: { crewOrder: 'asc' }
  })

  if (crews.length === 0) throw new Error("No crews found in the database. Please seed first.")

  for (let i = 0; i < daysToGenerate; i++) {
    const currentDay = new Date(startDate)
    currentDay.setDate(startDate.getDate() + i)
    currentDay.setHours(0, 0, 0, 0)

    const dayTimestamp = currentDay.getTime()
    const dayIndex = Math.floor(dayTimestamp / (1000 * 60 * 60 * 24))

    const assignedCrewIndex = Math.abs(dayIndex % crews.length)
    const backupCrewIndex = (assignedCrewIndex + 1) % crews.length

    const activeCrew = crews[assignedCrewIndex]
    const backupCrew = crews[backupCrewIndex]

    const isWeekend = currentDay.getDay() === 0 || currentDay.getDay() === 6

    // ── FIX: use setNZHours so times are stored as correct UTC regardless of
    // which timezone the server runs in. Previously setHours() used the server's
    // local timezone (UTC on Vercel), so times were stored 12–13 hours wrong.
    //
    // setNZHours(base, h, m) computes the UTC instant that equals h:mm NZ local
    // time, accounting for NZST (UTC+12) vs NZDT (UTC+13) automatically.
    const shiftStart = isWeekend
      ? setNZHours(new Date(currentDay), 7, 0)    // weekends: 07:00 NZ
      : setNZHours(new Date(currentDay), 17, 30)  // weekdays: 17:30 NZ

    // shiftEnd is always 07:00 NZ on the NEXT calendar day.
    // Pass a base that is midnight UTC of the next day so setNZHours lands on
    // the correct NZ calendar date (adding exactly 24 h is safe here because
    // NZ DST transitions at 02:00, not at midnight).
    const nextDayBase = new Date(currentDay.getTime() + 24 * 60 * 60 * 1000)
    const shiftEnd = setNZHours(nextDayBase, 7, 0)  // 07:00 NZ next morning

    const assignTruckLineup = async (crew: any, applianceName: string) => {
      const slot = await db.shiftSlot.create({
        data: {
          date: currentDay,
          appliance: applianceName,
          roleRequired: 'Full Crew',
          isWeekend: currentDay.getDay() === 0 || currentDay.getDay() === 6
        }
      })

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
        { role: 'FF3', member: extract(() => true) },
      ].filter(item => item.member !== null)

      for (const seat of lineup) {
        await db.shiftAssignment.create({
          data: {
            slotId: slot.id,
            applianceRole: seat.role,
            memberId: seat.member.id,
            startTime: shiftStart,
            endTime: shiftEnd,
            historicalRank: seat.member.rank,
            historicalWatchName: crew.watchName,
          }
        })
      }
    }

    await assignTruckLineup(activeCrew, '1st Due')
    await assignTruckLineup(backupCrew, '2nd Due')
  }

  return { success: true, message: `Successfully generated ${daysToGenerate} days.` }
}
