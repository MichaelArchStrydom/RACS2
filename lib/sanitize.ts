/**
 * Shared input sanitization for free-text fields entered by or about members.
 *
 * Every function here accepts `unknown`, not `string` -- server actions take
 * their arguments straight off the wire (FormData, a fetch body), so a
 * missing field, a stray `null`, or a client bypassing the form entirely can
 * hand these functions something that is not a string at all. Calling
 * `.trim()` on that directly throws a TypeError that Next.js turns into an
 * uncaught request-level crash -- coercing first makes every field
 * unconditionally safe to store, no matter what actually arrives.
 */

const MAX_LENGTHS = {
  name: 60,       // firstName, lastName
  rank: 30,
  zoneType: 30,
  email: 254,     // RFC 5321 max mailbox length
  phone: 30,
  shortText: 100, // watchName, qualification name, appliance name, etc.
  longText: 1000, // descriptions/notes
} as const

// Strips NUL and other C0/C1 control characters. NUL in particular is not a
// cosmetic issue -- Postgres text columns reject it outright ("invalid byte
// sequence"), so a stray NUL in a name field would otherwise crash the
// request with an uncaught Prisma error. Newline, carriage return, and tab
// are left alone.
function stripControlChars(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
}

// Trims, strips control characters, and collapses internal whitespace runs
// (tabs, repeated spaces, newlines from a pasted multi-line value) down to a
// single space -- then caps the length. This is the base every other helper
// below builds on.
export function sanitizeText(raw: unknown, maxLength: number = MAX_LENGTHS.shortText): string {
  const str = typeof raw === "string" ? raw : ""
  const cleaned = stripControlChars(str).trim().replace(/\s+/g, " ")
  return cleaned.slice(0, maxLength)
}

export function sanitizeName(raw: unknown): string {
  return sanitizeText(raw, MAX_LENGTHS.name)
}

export function sanitizeRank(raw: unknown): string {
  return sanitizeText(raw, MAX_LENGTHS.rank)
}

export function sanitizeZoneType(raw: unknown): string {
  return sanitizeText(raw, MAX_LENGTHS.zoneType)
}

export function sanitizePhone(raw: unknown): string {
  return sanitizeText(raw, MAX_LENGTHS.phone)
}

export function sanitizeLongText(raw: unknown): string {
  return sanitizeText(raw, MAX_LENGTHS.longText)
}

// Deliberately loose -- just enough to catch obvious garbage/mistakes, not a
// full RFC 5322 validator. Returns null for empty/invalid input so callers
// can store "no email" instead of a malformed one.
export function sanitizeEmail(raw: unknown): string | null {
  const cleaned = sanitizeText(raw, MAX_LENGTHS.email).toLowerCase()
  if (!cleaned) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ? cleaned : null
}
