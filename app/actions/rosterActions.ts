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

    //Hour ledger
    if (coveringMemberId !== request.requestedById) {
      const coveredHours = (coverEnd.getTime() - coverStart.getTime()) / (1000 * 60 * 60)

      await tx.hourLedgerEntry.create({
        data: {
          memberId: coveringMemberId,
          hoursChange: coveredHours,
          reason: 'SHIFT_COVERED_OUTGOING',
          relatedRequestId: requestId,
        }
      })
      await tx.member.update({
        where: { id: coveringMemberId },
        data: { hourBalance: { increment: coveredHours } }
      })

      await tx.hourLedgerEntry.create({
        data: {
          memberId: request.requestedById,
          hoursChange: -coveredHours,
          reason: 'SHIFT_COVERED_INCOMING',
          relatedRequestId: requestId,
        }
      })
      await tx.member.update({
        where: { id: request.requestedById },
        data: { hourBalance: { increment: -coveredHours } }
      })
    }

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
