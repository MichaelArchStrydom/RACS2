'use server'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { setNZHours } from '@/lib/timezone'
import { ALREADY_ACTIONED } from '@/lib/errors'

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
  // Fast fail before doing any work: cheap, catches the common case where
  // someone else already actioned this request.
  if (request.status !== 'PENDING') throw new Error(ALREADY_ACTIONED)

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

  const origReqStart = new Date(request.startTime)
  const origReqEnd = new Date(request.endTime)

  // RACE FIX: everything below runs in one transaction, and the request's
  // status flip is a CONDITIONAL update (only succeeds if it's still
  // PENDING). If two people accept the same request at once, only the first
  // transaction's updateMany matches a row — the second gets count 0 and
  // throws, rolling back its half-done assignment split instead of leaving
  // duplicate/inconsistent ShiftAssignment rows.
  await db.$transaction(async (tx) => {
    const claim = await tx.standInRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: {
        startTime: coverStart,
        endTime: coverEnd,
        status: "COMPLETED",
        coveredById: coveringMemberId
      }
    })
    if (claim.count === 0) throw new Error(ALREADY_ACTIONED)

    // FIX: request.requestedById is whoever is CURRENTLY asking for cover —
    // which may be the shift's original owner (memberId) OR someone who's
    // already covering it and now needs a further stand-in (actualMemberId).
    // Matching on memberId alone missed this second, "chain covering" case
    // entirely, so a further cover request could never find (or split) the
    // right assignment.
    const intersectingAssignments = await tx.shiftAssignment.findMany({
      where: {
        slotId: request.slotId,
        OR: [
          { memberId: request.requestedById },
          { actualMemberId: request.requestedById },
        ],
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

        // FIX: leftover (uncovered-by-this-action) slices must keep whoever
        // was already covering this assignment (assignment.actualMemberId).
        // Previously this was dropped, which silently reverted a covering
        // member's remaining shift back to the original owner.
        if (origStart.getTime() < actualStart.getTime()) {
          await tx.shiftAssignment.create({
            data: {
              slotId: assignment.slotId,
              applianceRole: assignment.applianceRole,
              memberId: assignment.memberId,
              actualMemberId: assignment.actualMemberId,
              startTime: origStart,
              endTime: actualStart,
              historicalRank: assignment.historicalRank,
              historicalWatchName: assignment.historicalWatchName
            }
          })
        }

        await tx.shiftAssignment.create({
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
          await tx.shiftAssignment.create({
            data: {
              slotId: assignment.slotId,
              applianceRole: assignment.applianceRole,
              memberId: assignment.memberId,
              actualMemberId: assignment.actualMemberId,
              startTime: actualEnd,
              endTime: origEnd,
              historicalRank: assignment.historicalRank,
              historicalWatchName: assignment.historicalWatchName
            }
          })
        }

        await tx.shiftAssignment.delete({ where: { id: assignment.id } })
      }
    }

    if (origReqStart.getTime() < coverStart.getTime()) {
      await tx.standInRequest.create({
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
      await tx.standInRequest.create({
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
  })

  revalidatePath('/')
}
