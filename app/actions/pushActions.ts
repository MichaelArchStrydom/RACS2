'use server'
import { db } from '@/lib/db'
import { getCurrentMember } from '@/lib/auth'
import { sendPushToMember, sendPushToMembers } from '@/lib/push'
import { revalidatePath } from 'next/cache'

interface SubscriptionJSON {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export async function subscribeToPush(subscription: SubscriptionJSON, userAgent?: string) {
  const caller = await getCurrentMember()
  if (!caller) throw new Error('Not signed in')

  await db.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    update: {
      memberId: caller.id,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent,
    },
    create: {
      memberId: caller.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent,
    },
  })
}

export async function unsubscribeFromPush(endpoint: string) {
  const caller = await getCurrentMember()
  if (!caller) throw new Error('Not signed in')

  // mapped to the caller's own id can't delete someone else's subscription
  // by guessing/reusing an endpoint string.
  await db.pushSubscription.deleteMany({ where: { endpoint, memberId: caller.id } })
}

export async function updateNotificationPreferences(prefs: {
  notifyNewCoverRequest: boolean
  notifyAnnouncement: boolean
  notifyStaleCoverReminder: boolean
  notifyMyRequestUpdates: boolean
}) {
  const caller = await getCurrentMember()
  if (!caller) throw new Error('Not signed in')

  await db.member.update({
    where: { id: caller.id },
    data: prefs,
  })
  revalidatePath('/profile')
}

export async function sendTestPushToSelf() {
  const caller = await getCurrentMember()
  if (!caller) throw new Error('Not signed in')

  await sendPushToMember(caller.id, {
    title: 'RACS2 test notification',
    body: `Hi ${caller.firstName} — if you can see this, push notifications are working on this device.`,
    url: '/profile',
  })
}

// Admin-only broadcast test pings every subscribed device regardless of
// notification category preferences, so an admin can verify real delivery
// and impress the boss
//
// `adminId` param kept for call-site compatibility but is unused/untrusted —
// see the equivalent comment on requireAdmin() in adminActions.ts for why.
export async function sendTestPushToAllMembers(adminId: string) {
  const admin = await getCurrentMember()
  if (!admin?.isAdmin) throw new Error('Unauthorised: admin access required')

  const subscriptions = await db.pushSubscription.findMany({ select: { memberId: true } })
  const memberIds = [...new Set(subscriptions.map((s) => s.memberId))]

  await sendPushToMembers(memberIds, {
    title: 'RACS2 test broadcast',
    body: `Sent by ${admin.firstName} ${admin.lastName} notifications working.`,
    url: '/',
  })

  return memberIds.length
}
