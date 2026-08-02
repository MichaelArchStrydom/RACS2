import webpush from 'web-push'
import { db } from './db'

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapidSubject = process.env.VAPID_SUBJECT

if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
}

export interface PushPayload {
  title: string
  body: string
  // Where notificationclick (public/sw.js) should focus/open — a path like
  // "/" or "/profile", not a full URL.
  url?: string
}

type SubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string }

// Sends to one subscription row, deletes it if the push relay says it's dead
async function sendToSubscription(sub: SubscriptionRow, payload: PushPayload): Promise<void> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload)
    )
  } catch (err: any) {
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {
      })
    } else {
      console.error('Push send failed', sub.id, err?.statusCode ?? err)
    }
  }
}

// Sends to every device a single member has subscribed
export async function sendPushToMember(memberId: string, payload: PushPayload): Promise<void> {
  const subs = await db.pushSubscription.findMany({ where: { memberId } })
  await Promise.all(subs.map((sub) => sendToSubscription(sub, payload)))
}

// Sends to every device across a set of members in one batched query
export async function sendPushToMembers(memberIds: string[], payload: PushPayload): Promise<void> {
  if (memberIds.length === 0) return
  const subs = await db.pushSubscription.findMany({ where: { memberId: { in: memberIds } } })
  await Promise.all(subs.map((sub) => sendToSubscription(sub, payload)))
}
