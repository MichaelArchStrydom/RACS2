/**
 * lib/auth.ts
 *
 * All session and password logic lives here.
 * Import this in server components, server actions, and middleware — never in client components.
 *
 * Cookie name:  racs2_session
 * Cookie value: a 64-char hex opaque token (randomBytes(32))
 *               — contains no user data; all info is fetched from DB on each lookup
 *
 * Remember-me behaviour:
 *   OFF  cookie has no maxAge (expires when browser closes) + DB row expires in 24 h
 *   ON   indefinite
 *  The DB expiry is the authoritative source; the cookie maxAge is just a UX hint.
 */

import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

// ─── Constants ────────────────────────────────────────────────────────────────

const COOKIE_NAME = 'racs2_session'
const SHORT_EXPIRY_HOURS = 24          // no remember-me: session lives 24 h
const INDEFINITE_WINDOW_DAYS = 400
const INDEFINITE_REFRESH_THRESHOLD_DAYS = 370          // renew with a ~30-day cushion
const BCRYPT_ROUNDS = 12          // cost factor — increase to 13/14 for higher security

// ─── Password helpers ─────────────────────────────────────────────────────────

/** Hash a plaintext password for storage. Use in server actions / admin resets. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

/** Constant-time comparison — returns true if plain matches the stored hash. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

// ─── Session creation ─────────────────────────────────────────────────────────

/**
 * Creates a new Session row in the DB and writes the token to an httpOnly cookie.
 *
 * Called after a successful login. The cookie is set before the redirect so the
 * browser receives it in the same response.
 */
export async function createSession(memberId: string, rememberMe: boolean): Promise<void> {
  const token = randomBytes(32).toString('hex')   // 64-char hex string
  const now = new Date()
  const expiresAt = rememberMe
    ? new Date(now.getTime() + INDEFINITE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    : new Date(now.getTime() + SHORT_EXPIRY_HOURS * 60 * 60 * 1000)

  await db.session.create({ data: { token, memberId, expiresAt, rememberMe } })

  const jar = await cookies()
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,                                   // JS cannot read this
    sameSite: 'lax',                                  // CSRF protection
    secure: process.env.NODE_ENV === 'production',  // HTTPS only in prod
    path: '/',
    ...(rememberMe
      ? { maxAge: INDEFINITE_WINDOW_DAYS * 24 * 60 * 60 }  // browser persists the cookie
      : {}),                                          // no maxAge → session cookie
  })
}

// ─── Session lookup ───────────────────────────────────────────────────────────

/**
 * Reads the session cookie, validates it against the DB, and returns the Member.
 *
 * Returns null when:
 *   - No cookie present
 *   - Token not found in DB (revoked / tampered)
 *   - Session has expired (row is deleted as a side-effect)
 *   - Member is inactive (deactivated by admin)
 *
 * Call this at the top of every protected server component and server action.
 */
export async function getCurrentMember() {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) return null

  const session = await db.session.findUnique({
    where: { token },
    include: { member: true },
  })

  if (!session) return null

  // Expired: clean up the row so stale tokens don't accumulate
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { token } }).catch(() => { })
    return null
  }

  // Deactivated member (admin action)
  if (!session.member.isActive) return null

  if (session.rememberMe) {
    const refreshThresholdMs = INDEFINITE_REFRESH_THRESHOLD_DAYS * 24 * 60 * 60 * 1000
    if (session.expiresAt.getTime() - Date.now() < refreshThresholdMs) {
      await extendSession(true).catch(() => { })
    }
  }

  return session.member
}

/**
 * Same as getCurrentMember() but throws a redirect to /login if not authenticated.
 * Use this as a one-liner at the top of protected pages:
 *
 *   const member = await requireMember()
 */
export async function requireMember() {
  const { redirect } = await import('next/navigation')
  const member = await getCurrentMember()
  if (!member!) redirect('/login')
  return member!
}

/**
 * Same as requireMember() but also checks isAdmin.
 * Redirects to / (not /login) so admin-only pages fail closed without
 * disclosing that the page exists.
 *
 *   const admin = await requireAdmin()
 */
export async function requireAdmin() {
  const { redirect } = await import('next/navigation')
  const member = await getCurrentMember()
  if (!member) redirect('/login')
  if (!member!.isAdmin) redirect('/')
  return member!
}

// ─── Session destruction ──────────────────────────────────────────────────────

/**
 * Deletes the current session from the DB and clears the cookie.
 * Called on explicit logout.
 */
export async function destroySession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value

  if (token) {
    await db.session.deleteMany({ where: { token } }).catch(() => { })
  }

  jar.delete(COOKIE_NAME)
}

/**
 * Revokes ALL sessions for a given member — forces re-login on every device.
 *
 * Call this after:
 *   - Admin resets a member's password
 *   - Admin deactivates a member
 *   - Member changes their own password
 */
export async function revokeAllSessionsForMember(memberId: string): Promise<void> {
  await db.session.deleteMany({ where: { memberId } })
}

/**
 * Extends the current session's expiry (and cookie maxAge) by the remember-me window.
 * Called automatically by getCurrentMember() to slide a remember-me session's window
 * forward on activity — see the module doc comment above. Throws if called somewhere
 * that can't mutate cookies (a Server Component render); callers should swallow that.
 */
export async function extendSession(rememberMe: boolean): Promise<void> {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) return

  const expiresAt = rememberMe
    ? new Date(Date.now() + INDEFINITE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + SHORT_EXPIRY_HOURS * 60 * 60 * 1000)

  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    ...(rememberMe ? { maxAge: INDEFINITE_WINDOW_DAYS * 24 * 60 * 60 } : {}),
  })

  await db.session.update({ where: { token }, data: { expiresAt, rememberMe } }).catch(() => { })
}
