'use server'
/**
 * FIX:
 * The 7-7 issue still happens randomly This is rosterActions issue I think.
*/
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

/**
 * Creates a cover request for a specific shift assignment
 */
export async function createStandInRequest(
  assignmentId: string,
  requestedById: string,
  startTime: Date,
  endTime: Date
) {
  const assignment = await db.shiftAssignment.findUnique({
    where: { id: assignmentId }
  })

  if (!assignment) throw new Error("Shift assignment not found")

  await db.standInRequest.create({
    data: {
      slotId: assignment.slotId,
      requestedById,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      status: "PENDING",
      requestType: "COVER"
    }
  })

  revalidatePath('/')
}

export async function acceptStandInRequest(
  requestId: string,
  coveringMemberId: string,
  selectedStartStr: string,
  selectedEndStr: string
) {
  const request = await db.standInRequest.findUnique({
    where: { id: requestId },
    include: { slot: true }
  })

  if (!request) throw new Error("Target stand-in request token not found")

  if (selectedStartStr === selectedEndStr) {
    throw new Error("Start time and end time cannot be identical.");
  }

  const [shours, smin] = selectedStartStr.split(':').map(Number)
  const [ehours, emin] = selectedEndStr.split(':').map(Number)

  const coverStart = new Date(request.startTime)
  coverStart.setHours(shours, smin, 0, 0)

  const coverEnd = new Date(request.endTime)
  coverEnd.setHours(ehours, emin, 0, 0)
  if (ehours < shours || (ehours === shours && emin < smin)) {
    coverEnd.setDate(coverEnd.getDate() + 1)
  }

  const intersectingAssignments = await db.shiftAssignment.findMany({
    where: {
      slotId: request.slotId,
      memberId: request.requestedById,
      startTime: { lt: coverEnd },
      endTime: { gt: coverStart }
    }
  })

  for (const assignment of intersectingAssignments) {
    const origStart = new Date(assignment.startTime)
    const origEnd = new Date(assignment.endTime)

    const actualStart = new Date(Math.max(origStart.getTime(), coverStart.getTime()))
    const actualEnd = new Date(Math.min(origEnd.getTime(), coverEnd.getTime()))

    if (actualStart.getTime() < actualEnd.getTime()) {

      if (origStart.getTime() < actualStart.getTime()) {
        await db.shiftAssignment.create({
          data: {
            slotId: assignment.slotId,
            applianceRole: assignment.applianceRole,
            memberId: assignment.memberId,
            startTime: origStart,
            endTime: actualStart,
            historicalRank: assignment.historicalRank,
            historicalWatchName: assignment.historicalWatchName
          }
        })
      }

      await db.shiftAssignment.create({
        data: {
          slotId: assignment.slotId,
          applianceRole: assignment.applianceRole,
          memberId: assignment.memberId,
          actualMemberId: coveringMemberId,
          startTime: actualStart,
          endTime: actualEnd,
          historicalRank: assignment.historicalRank,
          historicalWatchName: assignment.historicalWatchName
        }
      })

      if (actualEnd.getTime() < origEnd.getTime()) {
        await db.shiftAssignment.create({
          data: {
            slotId: assignment.slotId,
            applianceRole: assignment.applianceRole,
            memberId: assignment.memberId,
            startTime: actualEnd,
            endTime: origEnd,
            historicalRank: assignment.historicalRank,
            historicalWatchName: assignment.historicalWatchName
          }
        })
      }

      await db.shiftAssignment.delete({ where: { id: assignment.id } })
    }
  }

  const origReqStart = new Date(request.startTime)
  const origReqEnd = new Date(request.endTime)

  if (origReqStart.getTime() < coverStart.getTime()) {
    await db.standInRequest.create({
      data: {
        slotId: request.slotId,
        requestedById: request.requestedById,
        startTime: origReqStart,
        endTime: coverStart,
        status: "PENDING",
        requestType: request.requestType
      }
    })
  }

  if (coverEnd.getTime() < origReqEnd.getTime()) {
    await db.standInRequest.create({
      data: {
        slotId: request.slotId,
        requestedById: request.requestedById,
        startTime: coverEnd,
        endTime: origReqEnd,
        status: "PENDING",
        requestType: request.requestType
      }
    })
  }

  await db.standInRequest.update({
    where: { id: requestId },
    data: {
      startTime: coverStart,
      endTime: coverEnd,
      status: "COMPLETED",
      coveredById: coveringMemberId
    }
  })

  revalidatePath('/')
}
