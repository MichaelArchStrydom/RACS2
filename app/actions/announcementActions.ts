'use server'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function markAnnouncementRead(memberId: string, announcementId: string) {
  await db.announcementReceipt.upsert({
    where: { announcementId_memberId: { announcementId, memberId } },
    update: { readAt: new Date() },
    create: { announcementId, memberId, readAt: new Date() },
  })
  revalidatePath('/')
}

export async function markAnnouncementUnread(memberId: string, announcementId: string) {
  await db.announcementReceipt.upsert({
    where: { announcementId_memberId: { announcementId, memberId } },
    update: { readAt: null },
    create: { announcementId, memberId, readAt: null },
  })
  revalidatePath('/')
}

export async function archiveAnnouncement(memberId: string, announcementId: string) {
  await db.announcementReceipt.upsert({
    where: { announcementId_memberId: { announcementId, memberId } },
    update: { archivedAt: new Date() },
    create: { announcementId, memberId, archivedAt: new Date() },
  })
  revalidatePath('/')
}

export async function unarchiveAnnouncement(memberId: string, announcementId: string) {
  await db.announcementReceipt.upsert({
    where: { announcementId_memberId: { announcementId, memberId } },
    update: { archivedAt: null },
    create: { announcementId, memberId, archivedAt: null },
  })
  revalidatePath('/')
}
