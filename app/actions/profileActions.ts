'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireMember, hashPassword, verifyPassword, revokeAllSessionsForMember, destroySession } from '@/lib/auth'
import { sanitizeEmail, sanitizePhone } from '@/lib/sanitize'


export async function updateOwnProfile(data: { email?: string; phone?: string }) {
  const member = await requireMember()

  // sanitizeEmail returns null for anything empty/malformed rather than
  // throwing — an admin-facing field could reject bad input outright, but a
  // member just trying to update their phone number shouldn't get blocked by
  // an unrelated email typo, so an invalid email just clears the field.
  const email = data.email ? sanitizeEmail(data.email) : null
  const phone = data.phone ? sanitizePhone(data.phone) || null : null

  await db.member.update({
    where: { id: member.id },
    data: { email, phone },
  })

  revalidatePath('/profile')
}

export type ChangePasswordState = { error: string } | { success: true } | null

export async function changePasswordAction(
  prevState: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const member = await requireMember()

  const currentPasswordRaw = formData.get('currentPassword')
  const newPasswordRaw = formData.get('newPassword')
  const confirmPasswordRaw = formData.get('confirmPassword')

  const currentPassword = typeof currentPasswordRaw === 'string' ? currentPasswordRaw : ''
  const newPassword = typeof newPasswordRaw === 'string' ? newPasswordRaw : ''
  const confirmPassword = typeof confirmPasswordRaw === 'string' ? confirmPasswordRaw : ''

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: 'All fields are required.' }
  }
  if (newPassword !== confirmPassword) {
    return { error: 'New passwords do not match.' }
  }
  if (newPassword.length < 8) {
    return { error: 'New password must be at least 8 characters.' }
  }
  if (newPassword.length > 128) {
    return { error: 'New password must be under 128 characters.' }
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

  // Force re-login everywhere (including this device) after a password change
  await revokeAllSessionsForMember(member.id)
  await destroySession()
  redirect('/login')
}
