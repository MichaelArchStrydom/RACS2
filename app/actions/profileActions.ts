'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireMember, hashPassword, verifyPassword, revokeAllSessionsForMember, destroySession } from '@/lib/auth'

/**
 * Members can only ever edit their OWN profile — there is no memberId
 * parameter here at all. requireMember() reads the real session from the
 * cookie server-side, so there's no way for a client to spoof "which member"
 * by tampering with a hidden form field.
 */
export async function updateOwnProfile(data: { email?: string; phone?: string }) {
  const member = await requireMember()

  await db.member.update({
    where: { id: member.id },
    data: {
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
    },
  })

  revalidatePath('/profile')
}

export type ChangePasswordState = { error: string } | { success: true } | null

export async function changePasswordAction(
  prevState: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const member = await requireMember()

  const currentPassword = (formData.get('currentPassword') as string) ?? ''
  const newPassword = (formData.get('newPassword') as string) ?? ''
  const confirmPassword = (formData.get('confirmPassword') as string) ?? ''

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: 'All fields are required.' }
  }
  if (newPassword !== confirmPassword) {
    return { error: 'New passwords do not match.' }
  }
  if (newPassword.length < 8) {
    return { error: 'New password must be at least 8 characters.' }
  }

  // Re-fetch fresh from the DB — the session object may be stale.
  const fresh = await db.member.findUnique({ where: { id: member.id } })
  if (!fresh) return { error: 'Something went wrong. Please try again.' }

  const valid = await verifyPassword(currentPassword, fresh.password)
  if (!valid) return { error: 'Current password is incorrect.' }

  const newHash = await hashPassword(newPassword)
  await db.member.update({
    where: { id: member.id },
    data: { password: newHash, passwordUpdatedAt: new Date() },
  })

  // Force re-login everywhere (including this device) after a password
  // change — standard security practice, and the exact use case this
  // function was already documented for in lib/auth.ts.
  await revokeAllSessionsForMember(member.id)
  await destroySession()
  redirect('/login')
}
