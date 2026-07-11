'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { hashPassword, revokeAllSessionsForMember } from '@/lib/auth'

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

  // 3. Create the member record including the generated username.
  // FIX: was a literal placeholder string, not a real bcrypt hash — new
  // members could never actually log in. Hash the same documented default
  // password shown on the login page ("changeme123").
  const defaultHash = await hashPassword('changeme123')
  await db.member.create({
    data: {
      ...data,
      username,
      password: defaultHash,
      isActive: true,
      isAdmin: false,
    }
  })

  revalidatePath('/admin/members')
}

export async function resetMemberPassword(adminId: string, memberId: string, newPassword: string) {
  await requireAdmin(adminId)
  if (newPassword.length < 8) throw new Error('New password must be at least 8 characters.')

  const hash = await hashPassword(newPassword)
  await db.member.update({
    where: { id: memberId },
    data: { password: hash, passwordUpdatedAt: new Date() },
  })

  // Force the member to re-authenticate everywhere with the new password —
  // same security practice as when a member changes their own password.
  await revokeAllSessionsForMember(memberId)
  revalidatePath(`/admin/members/${memberId}`)
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

export async function createQualification(adminId: string, data: {
  key: string
  name: string
  description?: string
  affectsRostering: boolean
  enabledRoles: string[]
}) {
  await requireAdmin(adminId)

  const key = data.key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_')
  if (!key) throw new Error('A machine key is required.')

  await db.qualification.create({
    data: {
      key,
      name: data.name,
      description: data.description || null,
      affectsRostering: data.affectsRostering,
      enabledRoles: data.enabledRoles,
      isActive: true,
    }
  })

  revalidatePath('/admin/qualifications')
}

export async function setQualificationActive(adminId: string, qualificationId: string, isActive: boolean) {
  await requireAdmin(adminId)
  await db.qualification.update({ where: { id: qualificationId }, data: { isActive } })
  revalidatePath('/admin/qualifications')
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
  // Conditional update guards against cancelling a request a member has
  // just claimed — only cancel while it's still PENDING.
  const result = await db.standInRequest.updateMany({
    where: { id: requestId, status: 'PENDING' },
    data: { status: 'CANCELLED' }
  })
  if (result.count === 0) throw new Error('This request has already been actioned and can no longer be cancelled.')
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

// ─── ROSTER CALENDAR EDITOR ──────────────────────────────────────────────────
// Batched edits from the visual month-calendar editor. Nothing here touches
// the database until the admin hits the global "Save Changes" button, which
// sends every accumulated edit in one call so they all commit atomically.
export type RosterCalendarChange =
  | { type: 'cancel'; slotId: string }
  | { type: 'replaceCrew'; slotId: string; crewId: string }
  | { type: 'addAppliance'; dateStr: string; applianceName: string; crewId: string }

export async function applyRosterCalendarChanges(adminId: string, changes: RosterCalendarChange[]) {
  await requireAdmin(adminId)
  const { nzMidnightUTC } = await import('@/lib/timezone')
  const { isWeekendDate, getShiftTimesForDate, createAssignmentsForSlot } = await import('@/lib/roster-engine')

  const crewInclude = { members: { include: { qualifications: { include: { qualification: true } } } } }

  await db.$transaction(async (tx) => {
    for (const change of changes) {
      if (change.type === 'cancel') {
        await tx.shiftSlot.update({ where: { id: change.slotId }, data: { status: 'CANCELLED' } })
        continue
      }

      if (change.type === 'replaceCrew') {
        const slot = await tx.shiftSlot.findUnique({ where: { id: change.slotId } })
        if (!slot) throw new Error('Shift slot not found')
        const crew = await tx.crew.findUnique({ where: { id: change.crewId }, include: crewInclude })
        if (!crew) throw new Error('Crew not found')

        await tx.shiftAssignment.deleteMany({ where: { slotId: change.slotId } })

        // Reuse the slot's own stored weekday-ness rather than recompute —
        // it was already correctly determined when the slot was created.
        const dateStr = new Date(slot.date).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
        const { shiftStart, shiftEnd } = getShiftTimesForDate(dateStr, slot.isWeekend)
        await createAssignmentsForSlot(change.slotId, crew, shiftStart, shiftEnd, tx)
        continue
      }

      if (change.type === 'addAppliance') {
        const crew = await tx.crew.findUnique({ where: { id: change.crewId }, include: crewInclude })
        if (!crew) throw new Error('Crew not found')

        // isWeekend is derived server-side from the date itself, never
        // trusted from the client payload.
        const isWeekend = isWeekendDate(change.dateStr)
        const { shiftStart, shiftEnd } = getShiftTimesForDate(change.dateStr, isWeekend)
        const slot = await tx.shiftSlot.create({
          data: {
            date: nzMidnightUTC(change.dateStr),
            appliance: change.applianceName,
            roleRequired: 'Full Crew',
            isWeekend
          }
        })
        await createAssignmentsForSlot(slot.id, crew, shiftStart, shiftEnd, tx)
      }
    }
  })

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

export async function createAnnouncement(adminId: string, data: {
  title: string
  body: string
}) {
  await requireAdmin(adminId)

  await db.announcement.create({
    data: { ...data, createdById: adminId }
  })
  revalidatePath('/admin/announcements')
  revalidatePath('/')
}

export async function updateAnnouncement(adminId: string, announcementId: string, data: {
  title?: string
  body?: string
}) {
  await requireAdmin(adminId)

  await db.announcement.update({
    where: { id: announcementId },
    data: { ...data, updatedById: adminId }
  })
  revalidatePath('/admin/announcements')
  revalidatePath('/')
}

export async function deleteAnnouncement(adminId: string, announcementId: string) {
  await requireAdmin(adminId)
  await db.announcement.update({ where: { id: announcementId }, data: { isActive: false } })
  revalidatePath('/admin/announcements')
  revalidatePath('/')
}

