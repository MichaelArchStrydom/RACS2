'use server'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { setNZHours } from '@/lib/timezone'
import { ALREADY_ACTIONED } from '@/lib/errors'
import { getCurrentMember } from '@/lib/auth'

export async function createStandInRequest(
  assignmentId: string,
  requestedById: string,
  startTime: Date,
  endTime: Date
) {
  // AUTHZ: previously this trusted requestedById straight off the wire — any
  // logged-in user could post a request under someone else's name. Now the
  // real session decides: you may request for yourself, or for anyone if
  // you're an admin/moderator (the "on behalf" feature).
  const caller = await getCurrentMember()
  if (!caller) throw new Error('Not signed in')
  const isMod = caller.isAdmin || caller.isModerator
  if (requestedById !== caller.id && !isMod) {
    throw new Error('You can only request cover for your own shifts.')
  }

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
      requestType: "COVER",
      createdById: caller.id, // audit: who actually posted it
    }
  })

  revalidatePath('/')
}

// Moderator/admin cancel of someone's PENDING request, from the roster
// board's cancel mode. The selected HH:MM window defines WHICH PORTION to
// cancel (defaults to the whole request in the UI = full cancel); any
// uncancelled before/after portion is recreated as a fresh PENDING request —
// the same leftover-slice approach acceptStandInRequest uses for partial
// accepts. A PENDING request has never modified any ShiftAssignment, so
// cancelling needs no assignment unwind: flipping status alone means the
// shift simply stays with (returns to) whoever requested the cover.
export async function moderatorCancelStandInRequest(
  requestId: string,
  selectedStartStr: string,
  selectedEndStr: string
) {
  const caller = await getCurrentMember()
  if (!caller) throw new Error('Not signed in')
  if (!caller.isAdmin && !caller.isModerator) {
    throw new Error('Unauthorised: moderator or admin access required')
  }

  const request = await db.standInRequest.findUnique({ where: { id: requestId } })
  if (!request) throw new Error('Request not found')
  if (request.status !== 'PENDING') throw new Error(ALREADY_ACTIONED)

  const [shours, smin] = selectedStartStr.split(':').map(Number)
  const [ehours, emin] = selectedEndStr.split(':').map(Number)
  if ([shours, smin, ehours, emin].some(n => Number.isNaN(n))) {
    throw new Error('Invalid time input')
  }

  // Same NZ-wall-clock parsing + overnight rollover as acceptStandInRequest:
  // both times anchor on the request's start-day, and if end <= start it
  // rolls to the next day.
  const cancelStart = setNZHours(new Date(request.startTime), shours, smin)
  const cancelEnd = setNZHours(new Date(request.startTime), ehours, emin)
  if (cancelEnd.getTime() <= cancelStart.getTime()) {
    cancelEnd.setTime(cancelEnd.getTime() + 24 * 60 * 60 * 1000)
  }

  const origStart = new Date(request.startTime)
  const origEnd = new Date(request.endTime)

  // Clamp the cancel window to the request itself — cancelling outside the
  // request's own span is meaningless.
  const effStart = new Date(Math.max(origStart.getTime(), cancelStart.getTime()))
  const effEnd = new Date(Math.min(origEnd.getTime(), cancelEnd.getTime()))
  if (effStart.getTime() >= effEnd.getTime()) {
    throw new Error('Selected times do not overlap this request.')
  }

  await db.$transaction(async (tx) => {
    // Conditional claim — if someone accepted/cancelled it a moment ago,
    // count is 0 and we roll back instead of double-actioning.
    const claim = await tx.standInRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: {
        startTime: effStart,
        endTime: effEnd,
        status: 'CANCELLED',
        cancelledById: caller.id, // audit: who cancelled it
      }
    })
    if (claim.count === 0) throw new Error(ALREADY_ACTIONED)

    // Leftover slices outside the cancelled window stay PENDING, keeping the
    // original requester and creator attribution.
    if (origStart.getTime() < effStart.getTime()) {
      await tx.standInRequest.create({
        data: {
          slotId: request.slotId,
          requestedById: request.requestedById,
          startTime: origStart,
          endTime: effStart,
          status: 'PENDING',
          requestType: request.requestType,
          createdById: request.createdById,
        }
      })
    }
    if (effEnd.getTime() < origEnd.getTime()) {
      await tx.standInRequest.create({
        data: {
          slotId: request.slotId,
          requestedById: request.requestedById,
          startTime: effEnd,
          endTime: origEnd,
          status: 'PENDING',
          requestType: request.requestType,
          createdById: request.createdById,
        }
      })
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
