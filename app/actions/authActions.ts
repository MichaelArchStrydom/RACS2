'use server'

import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { verifyPassword, createSession, destroySession } from '@/lib/auth'

export type LoginState = { error: string } | null

/**
 * loginAction
 *
 * Designed for use with React's useActionState hook:
 *   const [state, formAction, isPending] = useActionState(loginAction, null)
 *
 * Returns { error } on failure so the form can display it inline.
 * Redirects to / on success (redirect() throws internally — no return needed after).
 *
 * Security notes:
 *   - Generic error message — never reveals which field was wrong
 *   - Both username lookup AND password comparison always run (prevents timing attacks
 *     that would reveal whether a username exists by measuring response time)
 *   - Username is lowercased before lookup so login is case-insensitive
 */
export async function loginAction(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const username = ((formData.get('username') as string) ?? '').trim().toLowerCase()
  const password = (formData.get('password') as string) ?? ''
  const rememberMe = formData.get('rememberMe') === 'on'

  const FAIL: LoginState = { error: 'Invalid username or password.' }

  // Basic presence check
  if (!username || !password) return FAIL

  // Look up by username
  const member = await db.member.findUnique({ where: { username } })

  // Always run bcrypt.compare even when no member found.
  // This prevents timing-based username enumeration.
  const dummyHash = '$2b$12$invalidhashpaddingtomakecomparerunXXXXXXXXXXXXXXXXXXXXX'
  const hashToCheck = member ? member.password : dummyHash

  const valid = await verifyPassword(password, hashToCheck)

  // Both checks must pass
  if (!member || !member.isActive || !valid) return FAIL

  await createSession(member.id, rememberMe)
  redirect('/')
}

/**
 * logoutAction
 *
 * Use as a form action:
 *   <form action={logoutAction}>
 *     <button type="submit">Log out</button>
 *   </form>
 *
 * Deletes the session row and clears the cookie, then redirects to /login.
 */
export async function logoutAction(): Promise<void> {
  await destroySession()
  redirect('/login')
}
