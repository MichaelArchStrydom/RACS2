'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { hashPassword, getCurrentMember } from '@/lib/auth'
import { sanitizeName, sanitizeRank, sanitizeZoneType, sanitizeEmail, sanitizeText, sanitizeLongText } from '@/lib/sanitize'
import { ALREADY_ACTIONED } from '@/lib/errors'
import { sendPushToMembers } from '@/lib/push'
import { epochDayIndex } from '@/lib/roster-engine'

async function requireAdmin() {
  const member = await getCurrentMember()
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
  isModerator?: boolean
  isDriver?: boolean
  isOfficer?: boolean
  expectedHoursPerPeriod?: number | null
}) {
  await requireAdmin()

  // Only sanitize fields actually present in this partial update — `undefined`
  // means "leave it alone" to Prisma, so a field this call doesn't touch must
  // stay undefined rather than become an empty string.
  const firstName = data.firstName !== undefined ? sanitizeName(data.firstName) : undefined
  const lastName = data.lastName !== undefined ? sanitizeName(data.lastName) : undefined
  const rank = data.rank !== undefined ? sanitizeRank(data.rank) : undefined
  const zoneType = data.zoneType !== undefined ? sanitizeZoneType(data.zoneType) : undefined

  if (firstName === '') throw new Error('First name cannot be empty.')
  if (lastName === '') throw new Error('Last name cannot be empty.')
  if (rank === '') throw new Error('Rank cannot be empty.')

  // Deactivating a member here must clear their crew assignment too, same as
  // the dedicated deactivateMember button — otherwise unchecking "Active
  // member" on this form (rather than using that button) silently left
  // crewId set, so the member kept being included in roster generation and
  // hour projections indefinitely.
  const crewId = data.isActive === false ? null : data.crewId

  await db.member.update({
    where: { id: memberId },
    data: { ...data, firstName, lastName, rank, zoneType, crewId },
  })
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
  await requireAdmin()

  const firstName = sanitizeName(data.firstName)
  const lastName = sanitizeName(data.lastName)
  const rank = sanitizeRank(data.rank)
  const zoneType = sanitizeZoneType(data.zoneType)
  const email = data.email ? sanitizeEmail(data.email) : null

  if (!firstName || !lastName) throw new Error('First and last name are required.')
  if (!rank) throw new Error('Rank is required.')

  // 1. Generate a clean base username
  const cleanFirst = firstName.toLowerCase().replace(/[^a-z]/g, '')
  const cleanLast = lastName.toLowerCase().replace(/[^a-z]/g, '')
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
  const defaultHash = await hashPassword('changeme123')
  await db.member.create({
    data: {
      ...data,
      firstName,
      lastName,
      rank,
      zoneType,
      email,
      username,
      password: defaultHash,
      isActive: true,
      isAdmin: false,
    }
  })

  revalidatePath('/admin/members')
}

export async function resetMemberPassword(adminId: string, memberId: string, newPassword: string) {
  await requireAdmin()
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters.')
  }
  if (newPassword.length > 128) throw new Error('New password must be under 128 characters.')

  const hash = await hashPassword(newPassword)

  // Atomic: the password change and session revocation must succeed or fail
  // together — otherwise a connection blip between the two could leave the
  // password changed but old sessions still valid, defeating the point.
  await db.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: memberId },
      data: { password: hash, passwordUpdatedAt: new Date() },
    })
    await tx.session.deleteMany({ where: { memberId } })
  })

  revalidatePath(`/admin/members/${memberId}`)
}

export async function deactivateMember(adminId: string, memberId: string) {
  await requireAdmin()
  await db.member.update({ where: { id: memberId }, data: { isActive: false, crewId: null } })
  revalidatePath('/admin/members')
}

// auto matching gets it right most of the time, but not always, so
// this is how an admin sets or corrects it manually.
export async function updateMemberOsmLink(adminId: string, memberId: string, osmId: string | null) {
  await requireAdmin()
  const cleanOsmId = osmId || null

  // Two members pointing at the same OSM profile would silently show one of
  // them a stranger's real training/skill status reject rather than allow it.
  if (cleanOsmId) {
    const conflict = await db.member.findFirst({
      where: { osmId: cleanOsmId, id: { not: memberId } },
      select: { firstName: true, lastName: true },
    })
    if (conflict) {
      throw new Error(`Already linked to ${conflict.firstName} ${conflict.lastName} — unlink them first.`)
    }
  }

  await db.member.update({ where: { id: memberId }, data: { osmId: cleanOsmId } })
  revalidatePath(`/admin/members/${memberId}`)
}

//QUALIFICATIONS
export async function setMemberQualification(adminId: string, memberId: string, qualKey: string, active: boolean) {
  await requireAdmin()

  const qual = await db.qualification.findUnique({ where: { key: qualKey } })
  if (!qual) throw new Error(`Unknown qualification: ${qualKey}`)

  // Atomic: upsert is race-safe on its own (backed by the @@unique constraint,
  // so two concurrent "award" clicks can't both hit a `create` and crash with
  // a P2002 conflict the way a manual findUnique-then-create could) — wrapped
  // in a transaction together with the isOfficer/isDriver sync so the two
  // can't desync from each other either.
  await db.$transaction(async (tx) => {
    await tx.memberQualification.upsert({
      where: { memberId_qualificationId: { memberId, qualificationId: qual.id } },
      update: { isActive: active },
      create: { memberId, qualificationId: qual.id, isActive: active },
    })

    // Keep booleans in sync for the roster engine
    if (qualKey === 'OFFICER') await tx.member.update({ where: { id: memberId }, data: { isOfficer: active } })
    if (qualKey === 'DRIVER') await tx.member.update({ where: { id: memberId }, data: { isDriver: active } })
  })

  revalidatePath(`/admin/members/${memberId}`)
}

export async function createQualification(adminId: string, data: {
  key: string
  name: string
  description?: string
  affectsRostering: boolean
  enabledRoles: string[]
}) {
  await requireAdmin()

  const key = data.key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_')
  if (!key) throw new Error('A machine key is required.')
  const name = sanitizeText(data.name)
  if (!name) throw new Error('A name is required.')
  const description = data.description ? sanitizeLongText(data.description) : null

  await db.qualification.create({
    data: {
      key,
      name,
      description,
      affectsRostering: data.affectsRostering,
      enabledRoles: data.enabledRoles,
      isActive: true,
    }
  })

  revalidatePath('/admin/qualifications')
}

export async function setQualificationActive(adminId: string, qualificationId: string, isActive: boolean) {
  await requireAdmin()
  await db.qualification.update({ where: { id: qualificationId }, data: { isActive } })
  revalidatePath('/admin/qualifications')
}

//  CREWS 

export async function updateCrew(adminId: string, crewId: string, data: {
  watchName?: string
  isActive?: boolean
}) {
  await requireAdmin()
  const watchName = data.watchName !== undefined ? sanitizeText(data.watchName) : undefined
  if (watchName === '') throw new Error('Watch name cannot be empty.')
  await db.crew.update({ where: { id: crewId }, data: { ...data, watchName } })
  revalidatePath('/admin/crews')
}

export async function addCrew(adminId: string, watchName: string) {
  await requireAdmin()
  const cleanName = sanitizeText(watchName)
  if (!cleanName) throw new Error('Watch name is required.')
  const crewCount = await db.crew.count()
  await db.crew.create({ data: { watchName: cleanName, crewOrder: crewCount, isActive: true } })
  revalidatePath('/admin/crews')
}

export async function reorderCrews(
  adminId: string,
  referenceDateStr: string,
  orderedCrewIds: string[]
) {
  await requireAdmin()

  const allCrews = await db.crew.findMany({ select: { id: true } })
  const crewCount = allCrews.length
  const validIds = new Set(allCrews.map((c) => c.id))

  if (orderedCrewIds.length !== crewCount || new Set(orderedCrewIds).size !== crewCount) {
    throw new Error('Every crew must appear exactly once in the new order.')
  }
  if (!orderedCrewIds.every((id) => validIds.has(id))) {
    throw new Error('Unknown crew in the new order.')
  }

  const dayIndex = epochDayIndex(referenceDateStr)
  const base = ((dayIndex % crewCount) + crewCount) % crewCount

  await db.$transaction(
    orderedCrewIds.map((crewId, k) =>
      db.crew.update({ where: { id: crewId }, data: { crewOrder: (base + k) % crewCount } })
    )
  )

  revalidatePath('/admin/crews')
}

export async function moveMemberToCrew(adminId: string, memberId: string, crewId: string | null) {
  await requireAdmin()
  await db.member.update({ where: { id: memberId }, data: { crewId } })
  revalidatePath('/admin/crews')
  revalidatePath('/admin/members')
}

//  APPLIANCES 

export async function updateAppliance(adminId: string, applianceId: string, data: {
  name?: string
  displayOrder?: number
  seatCount?: number
  minimumCrew?: number
  isActive?: boolean
  notes?: string
  seats?: { label: string; abbr: string }[]
}) {
  await requireAdmin()
  const name = data.name !== undefined ? sanitizeText(data.name) : undefined
  if (name === '') throw new Error('Appliance name cannot be empty.')
  const notes = data.notes !== undefined ? sanitizeLongText(data.notes) : undefined
  await db.appliance.update({ where: { id: applianceId }, data: { ...data, name, notes } })
  revalidatePath('/admin/appliances')
}

export async function addAppliance(adminId: string, data: {
  name: string
  displayOrder: number
  seatCount: number
  minimumCrew: number
  seats: { label: string; abbr: string }[]
}) {
  await requireAdmin()
  const name = sanitizeText(data.name)
  if (!name) throw new Error('Appliance name is required.')
  await db.appliance.create({ data: { ...data, name, isActive: true } })
  revalidatePath('/admin/appliances')
}

// ─── PUBLIC HOLIDAYS ─────────────────────────────────────────────────────────

export async function addPublicHoliday(adminId: string, data: {
  date: Date
  name: string
  shiftType: string
  notes?: string
}) {
  await requireAdmin()
  if (Number.isNaN(new Date(data.date).getTime())) throw new Error('Invalid date.')
  const name = sanitizeText(data.name)
  if (!name) throw new Error('Holiday name is required.')
  const notes = data.notes ? sanitizeLongText(data.notes) : undefined
  await db.publicHoliday.create({ data: { ...data, name, notes } })
  revalidatePath('/admin/holidays')
}

export async function deletePublicHoliday(adminId: string, holidayId: string) {
  await requireAdmin()
  await db.publicHoliday.delete({ where: { id: holidayId } })
  revalidatePath('/admin/holidays')
}

//  LEAVE 

export async function approveLeave(adminId: string, leaveId: string, adminNotes?: string) {
  const admin = await requireAdmin()
  // Conditional claim — same guard used for stand-in requests — so two
  // admins actioning the same pending leave request can't silently overwrite
  // each other (e.g. one approves, one rejects, moments apart).
  const result = await db.memberLeave.updateMany({
    where: { id: leaveId, status: 'PENDING' },
    data: {
      status: 'APPROVED',
      approvedById: admin.id,
      approvedAt: new Date(),
      adminNotes: adminNotes ? sanitizeLongText(adminNotes) : null,
    }
  })
  if (result.count === 0) throw new Error(ALREADY_ACTIONED)
  revalidatePath('/admin/leave')
}

export async function rejectLeave(adminId: string, leaveId: string, adminNotes?: string) {
  const admin = await requireAdmin()
  const result = await db.memberLeave.updateMany({
    where: { id: leaveId, status: 'PENDING' },
    data: { status: 'REJECTED', approvedById: admin.id, approvedAt: new Date(), adminNotes: adminNotes ? sanitizeLongText(adminNotes) : null }
  })
  if (result.count === 0) throw new Error(ALREADY_ACTIONED)
  revalidatePath('/admin/leave')
}

export async function cancelLeave(adminId: string, leaveId: string) {
  await requireAdmin()
  const result = await db.memberLeave.updateMany({
    where: { id: leaveId, status: { in: ['PENDING', 'APPROVED'] } },
    data: { status: 'CANCELLED' }
  })
  if (result.count === 0) throw new Error(ALREADY_ACTIONED)
  revalidatePath('/admin/leave')
}

export async function createLeave(adminId: string, data: {
  memberId: string
  startDate: Date
  endDate: Date
  leaveType: string
  notes?: string
}) {
  const admin = await requireAdmin()
  const startDate = new Date(data.startDate)
  const endDate = new Date(data.endDate)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error('Invalid start or end date.')
  }
  if (endDate < startDate) throw new Error('End date must be on or after the start date.')
  const notes = data.notes ? sanitizeLongText(data.notes) : undefined
  await db.memberLeave.create({
    data: { ...data, startDate, endDate, notes, status: 'APPROVED', approvedById: admin.id, approvedAt: new Date() }
  })
  revalidatePath('/admin/leave')
}

//  STAND-IN REQUESTS (admin cancel) 

export async function cancelStandInRequest(adminId: string, requestId: string) {
  await requireAdmin()
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

//  ROSTER GENERATION 

export async function generateRoster(adminId: string, startDateStr: string, days: number) {
  await requireAdmin()
  const { generateRosterForDateRange } = await import('@/lib/roster-engine')
  await generateRosterForDateRange(startDateStr, days)
  revalidatePath('/')
  revalidatePath('/admin/roster')
}

export async function clearRosterRange(adminId: string, startDateStr: string, endDateStr: string) {
  await requireAdmin()
  const { nzMidnightUTC, addDaysToDateString } = await import('@/lib/timezone')
  const start = nzMidnightUTC(startDateStr)
  const end = nzMidnightUTC(addDaysToDateString(endDateStr, 1))

  // Delete in dependency order, atomically — a crash partway through
  // previously could leave assignments/requests orphaned against slots that
  // still exist (or vice versa) with no way to detect or repair it.
  const slots = await db.shiftSlot.findMany({
    where: { date: { gte: start, lt: end } },
    select: { id: true }
  })
  const slotIds = slots.map(s => s.id)

  if (slotIds.length > 0) {
    await db.$transaction([
      db.standInRequest.deleteMany({ where: { slotId: { in: slotIds } } }),
      db.shiftAssignment.deleteMany({ where: { slotId: { in: slotIds } } }),
      db.shiftSlot.deleteMany({ where: { id: { in: slotIds } } }),
    ])
  }

  revalidatePath('/')
  revalidatePath('/admin/roster')
}

// Lets the calendar switch months client-side (no page navigation), so admins
// keep whatever mode/selection they're in and pending edits queued across
// multiple months survive the switch.
export async function getRosterCalendarMonth(adminId: string, monthStr: string) {
  await requireAdmin()
  const { getRosterCalendarSlotsByDate } = await import('@/lib/roster-calendar-data')
  return getRosterCalendarSlotsByDate(monthStr)
}

// Batched edits from the visual month-calendar editor. Nothing here touches
// the database until the admin hits the global "Save Changes" button, which
// sends every accumulated edit in one call so they all commit atomically.
export type RosterCalendarChange =
  | { type: 'cancel'; slotId: string }
  | { type: 'replaceCrew'; slotId: string; crewId: string }
  | { type: 'addAppliance'; dateStr: string; applianceName: string; crewId: string }

export async function applyRosterCalendarChanges(adminId: string, changes: RosterCalendarChange[]) {
  await requireAdmin()
  const { nzMidnightUTC } = await import('@/lib/timezone')
  const { isWeekendDate, getShiftTimesForDate, createAssignmentsForSlot } = await import('@/lib/roster-engine')

  const crewInclude = { members: { include: { qualifications: { include: { qualification: true } } } } }

  await db.$transaction(async (tx) => {
    for (const change of changes) {
      if (change.type === 'cancel') {
        await tx.shiftSlot.update({ where: { id: change.slotId }, data: { status: 'CANCELLED' } })
        // Cancelling a shift must also cancel any of its own PENDING requests
        // — otherwise a member could still accept cover for a shift that no
        // longer exists, creating real assignments/hour-ledger entries
        // against it.
        await tx.standInRequest.updateMany({
          where: { slotId: change.slotId, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        })
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

// SYSTEM CONFIG
export async function updateSystemConfig(adminId: string, key: string, value: string) {
  await requireAdmin()
  await db.systemConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
  revalidatePath('/admin')
}

//HOUR LEDGER (manual adjustment) 
export async function addHourAdjustment(adminId: string, memberId: string, hoursChange: number, notes: string) {
  await requireAdmin()
  if (typeof hoursChange !== 'number' || Number.isNaN(hoursChange) || !Number.isFinite(hoursChange)) {
    throw new Error('Hours must be a valid number.')
  }
  const cleanNotes = sanitizeLongText(notes)

  // Atomic: the ledger entry (audit trail) and the cached running balance
  // must move together, or a connection blip between the two leaves them
  // permanently out of sync with no reconciliation path.
  await db.$transaction(async (tx) => {
    await tx.hourLedgerEntry.create({
      data: { memberId, hoursChange, reason: 'MANUAL_ADJUSTMENT', notes: cleanNotes }
    })
    await tx.member.update({
      where: { id: memberId },
      data: { hourBalance: { increment: hoursChange } }
    })
  })
  revalidatePath(`/admin/members/${memberId}`)
}

export async function createAnnouncement(adminId: string, data: {
  title: string
  body: string
}) {
  const admin = await requireAdmin()

  const title = sanitizeText(data.title)
  if (!title) throw new Error('A title is required.')
  const body = sanitizeLongText(data.body)

  await db.announcement.create({
    data: { title, body, createdById: admin.id }
  })

  after(async () => {
    const recipients = await db.member.findMany({
      where: { isActive: true, notifyAnnouncement: true },
      select: { id: true },
    })
    await sendPushToMembers(recipients.map((m) => m.id), {
      title: `Announcement: ${title}`,
      body,
      url: '/',
    })
  })

  revalidatePath('/admin/announcements')
  revalidatePath('/')
}

export async function updateAnnouncement(adminId: string, announcementId: string, data: {
  title?: string
  body?: string
}) {
  const admin = await requireAdmin()

  const title = data.title !== undefined ? sanitizeText(data.title) : undefined
  if (title === '') throw new Error('Title cannot be empty.')
  const body = data.body !== undefined ? sanitizeLongText(data.body) : undefined

  await db.announcement.update({
    where: { id: announcementId },
    data: { ...data, title, body, updatedById: admin.id }
  })
  revalidatePath('/admin/announcements')
  revalidatePath('/')
}

export async function deleteAnnouncement(adminId: string, announcementId: string) {
  await requireAdmin()
  await db.announcement.update({ where: { id: announcementId }, data: { isActive: false } })
  revalidatePath('/admin/announcements')
  revalidatePath('/')
}

