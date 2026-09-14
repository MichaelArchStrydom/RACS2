import { db } from './db'
import { COVER_NEEDED_NOTIFICATION, USER_NO_COVER_NOTIFICATION_1H, USER_NO_COVER_NOTIFICATION_24H } from './notifications'
import { sendPushToMember, sendPushToMembers } from './push'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function formatSlotDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-NZ', {
    timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short',
  })
}

// Time-based notification checks that can't be triggered by a single action
export async function runNotificationSweep() {
  const now = new Date()

  const staleRequests = await db.standInRequest.findMany({
    where: {
      status: 'PENDING',
      staleReminderSentAt: null,
      createdAt: { lte: new Date(now.getTime() - 3 * DAY) },
      startTime: { gt: now, lte: new Date(now.getTime() + 2 * DAY) },
    },
    include: { slot: true },
  })
  let staleSentCount = 0
  for (const request of staleRequests) {

    const claim = await db.standInRequest.updateMany({
      where: { id: request.id, staleReminderSentAt: null },
      data: { staleReminderSentAt: now },
    })
    if (claim.count === 0) continue
    staleSentCount++

    const recipients = await db.member.findMany({
      where: { isActive: true, notifyStaleCoverReminder: true },
      select: { id: true },
    })
    await sendPushToMembers(recipients.map((m) => m.id), {
      title: COVER_NEEDED_NOTIFICATION.title,
      body: `${request.slot.appliance} on ${formatSlotDate(request.slot.date)} ` + COVER_NEEDED_NOTIFICATION.body,
      url: COVER_NEEDED_NOTIFICATION.url,
    })
  }

  const nudge24hRequests = await db.standInRequest.findMany({
    where: {
      status: 'PENDING',
      reminder24hSentAt: null,
      createdAt: { lte: new Date(now.getTime() - 5 * HOUR) },
      startTime: { gt: now, lte: new Date(now.getTime() + DAY) },
    },
    include: { slot: true, requestedBy: true },
  })
  let nudge24hSentCount = 0
  for (const request of nudge24hRequests) {
    const claim = await db.standInRequest.updateMany({
      where: { id: request.id, reminder24hSentAt: null },
      data: { reminder24hSentAt: now },
    })
    if (claim.count === 0) continue
    nudge24hSentCount++

    if (request.requestedBy.notifyMyRequestUpdates) {
      await sendPushToMember(request.requestedById, {
        title: USER_NO_COVER_NOTIFICATION_24H.title,
        body: `Your ${formatSlotDate(request.slot.date)} ${request.slot.appliance}` + USER_NO_COVER_NOTIFICATION_24H.body,
        url: USER_NO_COVER_NOTIFICATION_24H.url,
      })
    }
  }

  const nudge1hRequests = await db.standInRequest.findMany({
    where: {
      status: 'PENDING',
      reminder1hSentAt: null,
      startTime: { gt: now, lte: new Date(now.getTime() + HOUR) },
    },
    include: { slot: true, requestedBy: true },
  })
  let nudge1hSentCount = 0
  for (const request of nudge1hRequests) {
    const claim = await db.standInRequest.updateMany({
      where: { id: request.id, reminder1hSentAt: null },
      data: { reminder1hSentAt: now },
    })
    if (claim.count === 0) continue
    nudge1hSentCount++

    if (request.requestedBy.notifyMyRequestUpdates) {
      await sendPushToMember(request.requestedById, {
        title: USER_NO_COVER_NOTIFICATION_1H.title,
        body: `Your ${formatSlotDate(request.slot.date)} ${request.slot.appliance}` + USER_NO_COVER_NOTIFICATION_1H.body,
        url: USER_NO_COVER_NOTIFICATION_1H.url,
      })
    }
  }

  return {
    staleReminders: staleSentCount,
    nudge24h: nudge24hSentCount,
    nudge1h: nudge1hSentCount,
  }
}
