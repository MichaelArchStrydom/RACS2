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

  // ── FIX: interpret the user-entered time strings as NZ local time.
  //
  // Previously, setHours() was used here, which on Vercel (UTC) would treat
  // "17:30" as 17:30 UTC instead of 17:30 NZ (= 05:30 UTC).  The result was
  // that cover windows were stored 12-13 hours off.
  //
  // setNZHours(base, h, m) converts h:mm NZ local → UTC, accounting for DST.
  // Both coverStart and coverEnd use request.startTime as the base date so
  // they land on the correct NZ calendar day.  The existing overflow check
  // (coverEnd ≤ coverStart → add 24 h) still handles overnight spans correctly
  // because setNZHours for 07:00 NZ produces a UTC timestamp before the
  // 17:30 NZ start — exactly like the original code intended.
  const coverStart = setNZHours(new Date(request.startTime), shours, smin)
  const coverEnd = setNZHours(new Date(request.startTime), ehours, emin)

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
            historicalWatchName: assignment.historicalWatchName,
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
          historicalWatchName: assignment.historicalWatchName,
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
            historicalWatchName: assignment.historicalWatchName,
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
        requestType: request.requestType,
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
        requestType: request.requestType,
      }
    })
  }

  await db.standInRequest.update({
    where: { id: requestId },
    data: {
      startTime: coverStart,
      endTime: coverEnd,
      status: "COMPLETED",
      coveredById: coveringMemberId,
    }
  })

  revalidatePath('/')
}
