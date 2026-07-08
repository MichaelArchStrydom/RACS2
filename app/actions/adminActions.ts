'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

// ─── AUTH GUARD ───────────────────────────────────────────────────────────────
// Every action calls this first. Pass the activeUserId from the form.
async function requireAdmin(userId: string) {
  const member = await db.member.findUnique({ where: { id: userId } })
  if (!member?.isAdmin) throw new Error('Unauthorised: admin access required')
  return member
}

// ─── MEMBERS ─────────────────────────────────────────────────────────────────

export async function updateMember(adminId: string, memberId: string, data: {
  firstName?: string
  lastName?: string
  rank?: string
  crewId?: string | null
  zoneType?: string
  isActive?: boolean
  isAdmin?: boolean
  isDriver?: boolean
  isOfficer?: boolean
  expectedHoursPerPeriod?: number | null
}) {
  await requireAdmin(adminId)
  await db.member.update({ where: { id: memberId }, data })
  revalidatePath('/admin/members')
  revalidatePath(`/admin/members/${memberId}`)
}

export async function addMember(adminId: string, data: {
  firstName: string
  lastName: string
  email?: string | null
  rank: string
  crewId?: string | null
  zoneType: string
  isDriver: boolean
  isOfficer: boolean
}) {
  await requireAdmin(adminId)

  // 1. Generate a clean base username
  const cleanFirst = data.firstName.toLowerCase().replace(/[^a-z]/g, '')
  const cleanLast = data.lastName.toLowerCase().replace(/[^a-z]/g, '')
  const baseUsername = `${cleanFirst}.${cleanLast}`

  // 2. Query DB to ensure uniqueness (handling collisions)
  let username = baseUsername
  let counter = 2

  while (true) {
    const existing = await db.member.findUnique({ where: { username } })
    if (!existing) break
    username = `${baseUsername}.${counter}`
    counter++
  }

  // 3. Create the member record including the generated username
  await db.member.create({
    data: {
      ...data,
      username,
      password: 'hashed_password_placeholder', // FIX: Change this to a real bcrypt
      isActive: true,
      isAdmin: false,
    }
  })

  revalidatePath('/admin/members')
}

export async function deactivateMember(adminId: string, memberId: string) {
  await requireAdmin(adminId)
  await db.member.update({ where: { id: memberId }, data: { isActive: false, crewId: null } })
  revalidatePath('/admin/members')
}

// ─── QUALIFICATIONS ───────────────────────────────────────────────────────────

export async function setMemberQualification(adminId: string, memberId: string, qualKey: string, active: boolean) {
  await requireAdmin(adminId)

  const qual = await db.qualification.findUnique({ where: { key: qualKey } })
  if (!qual) throw new Error(`Unknown qualification: ${qualKey}`)

  const existing = await db.memberQualification.findUnique({
    where: { memberId_qualificationId: { memberId, qualificationId: qual.id } }
  })

  if (active) {
    if (existing) {
      await db.memberQualification.update({
        where: { memberId_qualificationId: { memberId, qualificationId: qual.id } },
        data: { isActive: true }
      })
    } else {
      await db.memberQualification.create({
        data: { memberId, qualificationId: qual.id, isActive: true }
      })
    }
    // Keep booleans in sync for the roster engine
    if (qualKey === 'OFFICER') await db.member.update({ where: { id: memberId }, data: { isOfficer: true } })
    if (qualKey === 'DRIVER') await db.member.update({ where: { id: memberId }, data: { isDriver: true } })
  } else {
    if (existing) {
      await db.memberQualification.update({
        where: { memberId_qualificationId: { memberId, qualificationId: qual.id } },
        data: { isActive: false }
      })
    }
    if (qualKey === 'OFFICER') await db.member.update({ where: { id: memberId }, data: { isOfficer: false } })
    if (qualKey === 'DRIVER') await db.member.update({ where: { id: memberId }, data: { isDriver: false } })
  }

  revalidatePath(`/admin/members/${memberId}`)
}

// ─── CREWS ────────────────────────────────────────────────────────────────────

export async function updateCrew(adminId: string, crewId: string, data: {
  watchName?: string
  crewOrder?: number
  isActive?: boolean
}) {
  await requireAdmin(adminId)
  await db.crew.update({ where: { id: crewId }, data })
  revalidatePath('/admin/crews')
}

export async function addCrew(adminId: string, watchName: string, crewOrder: number) {
  await requireAdmin(adminId)
  await db.crew.create({ data: { watchName, crewOrder, isActive: true } })
  revalidatePath('/admin/crews')
}

export async function moveMemberToCrew(adminId: string, memberId: string, crewId: string | null) {
  await requireAdmin(adminId)
  await db.member.update({ where: { id: memberId }, data: { crewId } })
  revalidatePath('/admin/crews')
  revalidatePath('/admin/members')
}

// ─── APPLIANCES ───────────────────────────────────────────────────────────────

export async function updateAppliance(adminId: string, applianceId: string, data: {
  name?: string
  displayOrder?: number
  seatCount?: number
  minimumCrew?: number
  isActive?: boolean
  notes?: string
}) {
  await requireAdmin(adminId)
  await db.appliance.update({ where: { id: applianceId }, data })
  revalidatePath('/admin/appliances')
}

export async function addAppliance(adminId: string, data: {
  name: string
  displayOrder: number
  seatCount: number
  minimumCrew: number
}) {
  await requireAdmin(adminId)
  await db.appliance.create({ data: { ...data, isActive: true } })
  revalidatePath('/admin/appliances')
}

// ─── PUBLIC HOLIDAYS ─────────────────────────────────────────────────────────

export async function addPublicHoliday(adminId: string, data: {
  date: Date
  name: string
  shiftType: string
  notes?: string
}) {
  await requireAdmin(adminId)
  await db.publicHoliday.create({ data })
  revalidatePath('/admin/holidays')
}

export async function deletePublicHoliday(adminId: string, holidayId: string) {
  await requireAdmin(adminId)
  await db.publicHoliday.delete({ where: { id: holidayId } })
  revalidatePath('/admin/holidays')
}

// ─── LEAVE ────────────────────────────────────────────────────────────────────

export async function approveLeave(adminId: string, leaveId: string, adminNotes?: string) {
  await requireAdmin(adminId)
  await db.memberLeave.update({
    where: { id: leaveId },
    data: {
      status: 'APPROVED',
      approvedById: adminId,
      approvedAt: new Date(),
      adminNotes: adminNotes ?? null,
    }
  })
  revalidatePath('/admin/leave')
}

export async function rejectLeave(adminId: string, leaveId: string, adminNotes?: string) {
  await requireAdmin(adminId)
  await db.memberLeave.update({
    where: { id: leaveId },
    data: { status: 'REJECTED', approvedById: adminId, approvedAt: new Date(), adminNotes: adminNotes ?? null }
  })
  revalidatePath('/admin/leave')
}

export async function cancelLeave(adminId: string, leaveId: string) {
  await requireAdmin(adminId)
  await db.memberLeave.update({ where: { id: leaveId }, data: { status: 'CANCELLED' } })
  revalidatePath('/admin/leave')
}

export async function createLeave(adminId: string, data: {
  memberId: string
  startDate: Date
  endDate: Date
  leaveType: string
  notes?: string
}) {
  await requireAdmin(adminId)
  await db.memberLeave.create({ data: { ...data, status: 'APPROVED', approvedById: adminId, approvedAt: new Date() } })
  revalidatePath('/admin/leave')
}

// ─── STAND-IN REQUESTS (admin cancel) ────────────────────────────────────────

export async function cancelStandInRequest(adminId: string, requestId: string) {
  await requireAdmin(adminId)
  await db.standInRequest.update({ where: { id: requestId }, data: { status: 'CANCELLED' } })
  revalidatePath('/admin')
  revalidatePath('/')
}

// ─── ROSTER GENERATION ───────────────────────────────────────────────────────

export async function generateRoster(adminId: string, startDateStr: string, days: number) {
  await requireAdmin(adminId)
  const { generateRosterForDateRange } = await import('@/lib/roster-engine')
  await generateRosterForDateRange(startDateStr, days)
  revalidatePath('/')
  revalidatePath('/admin/roster')
}

export async function clearRosterRange(adminId: string, startDateStr: string, endDateStr: string) {
  await requireAdmin(adminId)
  const { nzMidnightUTC, addDaysToDateString } = await import('@/lib/timezone')
  const start = nzMidnightUTC(startDateStr)
  const end = nzMidnightUTC(addDaysToDateString(endDateStr, 1))

  // Delete in dependency order
  const slots = await db.shiftSlot.findMany({
    where: { date: { gte: start, lt: end } },
    select: { id: true }
  })
  const slotIds = slots.map(s => s.id)

  if (slotIds.length > 0) {
    await db.standInRequest.deleteMany({ where: { slotId: { in: slotIds } } })
    await db.shiftAssignment.deleteMany({ where: { slotId: { in: slotIds } } })
    await db.shiftSlot.deleteMany({ where: { id: { in: slotIds } } })
  }

  revalidatePath('/')
  revalidatePath('/admin/roster')
}

// ─── SYSTEM CONFIG ────────────────────────────────────────────────────────────

export async function updateSystemConfig(adminId: string, key: string, value: string) {
  await requireAdmin(adminId)
  await db.systemConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
  revalidatePath('/admin')
}

// ─── HOUR LEDGER (manual adjustment) ─────────────────────────────────────────

export async function addHourAdjustment(adminId: string, memberId: string, hoursChange: number, notes: string) {
  await requireAdmin(adminId)
  await db.hourLedgerEntry.create({
    data: { memberId, hoursChange, reason: 'MANUAL_ADJUSTMENT', notes }
  })
  await db.member.update({
    where: { id: memberId },
    data: { hourBalance: { increment: hoursChange } }
  })
  revalidatePath(`/admin/members/${memberId}`)
}
