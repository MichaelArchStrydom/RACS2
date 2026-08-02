'use server'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { isMoreThanOneDayPast, formatNZTime } from '@/lib/timezone'
import { parseTimeRangeOnDay, isWithinRange, TIME_RANGE_INVALID_MESSAGE } from '@/lib/shiftTime'
import { ALREADY_ACTIONED } from '@/lib/errors'
import { getCurrentMember } from '@/lib/auth'
import { sendPushToMember, sendPushToMembers } from '@/lib/push'

export async function createStandInRequest(
  assignmentId: string,
  requestedById: string,
  startTime: Date,
  endTime: Date
) {
  // AUTHZ: previously this trusted requestedById straight off the wire — any
  // logged-in user could post a request under someone else's name. Now the
  // real session decides: you may request for yourself, or for anyone if
  // you're an admin/moderator (the "on behalf" feature). The same isMod flag
  // also exempts admins/mods from the past-shift restriction below.
  const caller = await getCurrentMember()
  if (!caller) throw new Error('Not signed in')
  const isMod = caller.isAdmin || caller.isModerator
  if (requestedById !== caller.id && !isMod) {
    throw new Error('You can only request cover for your own shifts.')
  }

  const assignment = await db.shiftAssignment.findUnique({
    where: { id: assignmentId },
    include: { slot: true }
  })

  if (!assignment) throw new Error("Shift assignment not found")

  if (!isMod && isMoreThanOneDayPast(assignment.slot.date)) {
    throw new Error('This shift is too far in the past — ask an admin to make this change.')
  }

  const start = new Date(startTime)
  const end = new Date(endTime)
  const { startTime: boundStart, endTime: boundEnd } = await mergeShifts(assignmentId)
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    !isWithinRange(start, end, boundStart, boundEnd)
  ) {
    throw new Error(TIME_RANGE_INVALID_MESSAGE)
  }

  await db.standInRequest.create({
    data: {
      slotId: assignment.slotId,
      requestedById,
      startTime: start,
      endTime: end,
      status: "PENDING",
      requestType: "COVER",
      createdById: caller.id, // audit: who actually posted it
    }
  })

  after(async () => {
    const dateStr = new Date(assignment.slot.date).toLocaleDateString('en-NZ', {
      timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short',
    })
    const recipients = await db.member.findMany({
      where: { isActive: true, notifyNewCoverRequest: true, id: { not: requestedById } },
      select: { id: true },
    })
    await sendPushToMembers(recipients.map((m) => m.id), {
      title: 'New cover request',
      body: `${dateStr} · ${assignment.slot.appliance} · ${formatNZTime(start)}–${formatNZTime(end)}`,
      url: '/',
    })
  })

  revalidatePath('/')
}

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

  // Same NZ-wall-clock parsing + overnight rollover as acceptStandInRequest:
  // both times anchor on the request's start-day, and if end <= start it
  // rolls to the next day.
  const parsed = parseTimeRangeOnDay(request.startTime, selectedStartStr, selectedEndStr)
  if (!parsed) throw new Error('Invalid time input')
  const { start: cancelStart, end: cancelEnd } = parsed

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
  const caller = await getCurrentMember()
  if (!caller) throw new Error('Not signed in')
  const isMod = caller.isAdmin || caller.isModerator
  if (coveringMemberId !== caller.id && !isMod) {
    throw new Error('You can only pick up or retract cover for yourself.')
  }

  const request = await db.standInRequest.findUnique({
    where: { id: requestId },
    include: { slot: true }
  })

  if (!request) throw new Error("Target stand-in request token not found")

  if (request.status !== 'PENDING') throw new Error(ALREADY_ACTIONED)

  if (!isMod && isMoreThanOneDayPast(request.slot.date)) {
    throw new Error('This shift is too far in the past — ask an admin to make this change.')
  }

  const parsed = parseTimeRangeOnDay(request.startTime, selectedStartStr, selectedEndStr)
  if (!parsed) throw new Error('Invalid time input')
  const { start: coverStart, end: coverEnd } = parsed

  const origReqStart = new Date(request.startTime)
  const origReqEnd = new Date(request.endTime)

  if (!isWithinRange(coverStart, coverEnd, origReqStart, origReqEnd)) {
    throw new Error(TIME_RANGE_INVALID_MESSAGE)
  }

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
            actualMemberId: coveringMemberId === assignment.memberId ? null : coveringMemberId,
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

  // Only notify on a genuine pickup by someone else — a self-reclaim
  // (retracting your own not-yet-taken request) is the requester acting on
  // their own request, not news to tell them.
  if (coveringMemberId !== request.requestedById) {
    after(async () => {
      const coveringMember = await db.member.findUnique({ where: { id: coveringMemberId } })
      const requester = await db.member.findUnique({ where: { id: request.requestedById } })
      if (!requester?.notifyMyRequestUpdates) return
      const dateStr = new Date(request.slot.date).toLocaleDateString('en-NZ', {
        timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short',
      })
      await sendPushToMember(request.requestedById, {
        title: 'Your cover request was picked up',
        body: `${coveringMember?.firstName ?? 'Someone nice'} ${coveringMember?.lastName ?? ''} covered your ${dateStr} shift.`,
        url: '/',
      })
    })
  }

  revalidatePath('/')
}

function mergerHelper(
  targetIndex: number,
  sorted: { id: string; memberId: string; actualMemberId: string | null; startTime: Date; endTime: Date }[],
  isForward: boolean
): Date {
  let i = targetIndex
  while (isForward ? i < sorted.length - 1 : i > 0) {
    const current = sorted[i]
    const candidate = isForward ? sorted[i + 1] : sorted[i - 1]

    const currentOwner = current.actualMemberId ?? current.memberId
    const isSameOwner = (candidate.actualMemberId ?? candidate.memberId) === currentOwner
    const isContiguous = isForward
      ? candidate.startTime.getTime() === current.endTime.getTime()
      : candidate.endTime.getTime() === current.startTime.getTime()
    const isCurrentCovered = !!current.actualMemberId && current.actualMemberId !== current.memberId
    const isCandidateCovered = !!candidate.actualMemberId && candidate.actualMemberId !== candidate.memberId
    const isSameStatus = isCurrentCovered === isCandidateCovered

    if (isSameOwner && isContiguous && isSameStatus) {
      isForward ? i++ : i--
    } else {
      break
    }
  }
  return isForward ? sorted[i].endTime : sorted[i].startTime
}

export async function mergeShifts(assignmentId: string): Promise<{ startTime: Date; endTime: Date }> {
  const target = await db.shiftAssignment.findUnique({ where: { id: assignmentId } })
  if (!target) throw new Error('Shift assignment not found')

  const pool = await db.shiftAssignment.findMany({
    where: { slotId: target.slotId, applianceRole: target.applianceRole },
  })

  const sorted = pool.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

  const targetIndex = sorted.findIndex(a => a.id === target.id)
  if (targetIndex === -1) throw new Error('Shift assignment not found in its own seat/day pool')

  const startTime = mergerHelper(targetIndex, sorted, false)
  const endTime = mergerHelper(targetIndex, sorted, true)
  return { startTime, endTime }
}
