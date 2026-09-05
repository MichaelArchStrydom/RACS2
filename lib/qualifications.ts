import { db } from './db'

export async function getMemberQualKeys(memberId: string): Promise<Set<string>> {
  const held = await db.memberQualification.findMany({
    where: {
      memberId,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: { qualification: true },
  })
  return new Set(held.map((mq) => mq.qualification.key))
}

export async function getRequiredQualKeysForSeat(applianceName: string, applianceRole: string): Promise<string[]> {
  const appliance = await db.appliance.findUnique({ where: { name: applianceName }, select: { seats: true } })
  if (!appliance) return []
  const seats = appliance.seats as { label: string; abbr: string; requiredQualKeys?: string[] }[]
  return seats.find((s) => s.label === applianceRole)?.requiredQualKeys ?? []
}

// Throws with a human-readable message naming the missing qualifications —
// callers that want to let admins/mods override should simply not call this.
export async function assertMemberMeetsSeatRequirements(memberId: string, applianceName: string, applianceRole: string): Promise<void> {
  const required = await getRequiredQualKeysForSeat(applianceName, applianceRole)
  if (required.length === 0) return

  const held = await getMemberQualKeys(memberId)
  const missing = required.filter((key) => !held.has(key))
  if (missing.length === 0) return

  const missingQuals = await db.qualification.findMany({ where: { key: { in: missing } }, select: { name: true } })
  const names = missingQuals.map((q) => q.name).join(', ')
  throw new Error(`Missing required qualification${missing.length > 1 ? 's' : ''} for this seat: ${names}`)
}
