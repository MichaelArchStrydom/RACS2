'use server'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { setNZHours } from '@/lib/timezone'

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

  const [shours, smin] = selectedStartStr.split(':').map(Number)
  const [ehours, emin] = selectedEndStr.split(':').map(Number)

  // FIX: setHours() used the server's local timezone — on Vercel (UTC) that
  // treated "17:30" as 17:30 UTC instead of 17:30 NZ (= 05:30 UTC), storing
  // cover windows 12-13h off. setNZHours() converts NZ wall-clock time to the
  // correct UTC instant regardless of server timezone.
  //
  // Both coverStart and coverEnd are based on request.startTime's calendar day
  // (not request.endTime, which may already be the next day for overnight
  // shifts) so the day-rollover logic below is the only place that adds a day.
  const coverStart = setNZHours(new Date(request.startTime), shours, smin)
  const coverEnd = setNZHours(new Date(request.startTime), ehours, emin)

  // Compare actual timestamps — if end is not after start, add a day.
  // This correctly handles 07:00→07:00 (adds a day → 24h cover) and
  // 20:00→07:00 (adds a day → 11h cover), while leaving 17:30→23:00 alone.
  if (coverEnd.getTime() <= coverStart.getTime()) {
    coverEnd.setTime(coverEnd.getTime() + 24 * 60 * 60 * 1000)
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
