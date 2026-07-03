import { db } from './db'

export async function generateRosterForDateRange(startDate: Date, daysToGenerate: number) {
  const crews = await db.crew.findMany({
    include: { members: true },
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

    const shiftStart = new Date(currentDay)
    if (isWeekend) {
      shiftStart.setHours(7, 0, 0, 0) // Weekends start at 07:00
    } else {
      shiftStart.setHours(17, 30, 0, 0) // Weekdays start at 17:30
    }

    const shiftEnd = new Date(currentDay)
    shiftEnd.setDate(currentDay.getDate() + 1) // Both configurations wrap to the next morning
    shiftEnd.setHours(7, 0, 0, 0) // Both end at 07:00 the following day

    // Helper function to pull the right people for the seats
    const assignTruckLineup = async (crew: any, applianceName: string) => {
      const slot = await db.shiftSlot.create({
        data: {
          date: currentDay,
          appliance: applianceName,
          roleRequired: 'Full Crew',
          isWeekend: currentDay.getDay() === 0 || currentDay.getDay() === 6
        }
      })

      // Extract specific roles to guarantee filling the seats
      let availableMembers = [...crew.members]
      const extract = (condition: (m: any) => boolean) => {
        const index = availableMembers.findIndex(condition)
        if (index !== -1) return availableMembers.splice(index, 1)[0]
        return null
      }

      const lineup = [// REMOVED ISDRIVER AND isOfficer FROM HERE TO RELY ON SCALABLE QUALIFICATIONS
        { role: 'OIC', member: extract(m => m.qualifications.some((mq: any) => mq.qualification?.key === 'SO_QUALIFIED')) || extract(() => true) },
        { role: 'Driver', member: extract(m => m.qualifications.some((mq: any) => mq.qualification?.key === 'PUMP_OP')) || extract(() => true) },
        { role: 'FF1', member: extract(() => true) },
        { role: 'FF2', member: extract(() => true) },
        { role: 'FF3', member: extract(() => true) } // <-- ADD THIS SEAT
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
