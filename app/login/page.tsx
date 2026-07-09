/**
 * app/login/page.tsx
 *
 * Public route, but still does a real (DB-validated) session check —
 * not just "is there a cookie" — before deciding whether to show the form
 * or bounce an already-logged-in visitor to "/". Checking real validity
 * here (rather than in proxy.ts, which can only see cookie presence) is
 * what prevents a stale/invalid cookie from ever causing a redirect loop
 * between "/" and "/login".
 */

import { redirect } from 'next/navigation'
import { getCurrentMember } from '@/lib/auth'
import LoginForm from '@/components/LoginForm'

export default async function LoginPage() {
  const member = await getCurrentMember()
  if (member) redirect('/')

  return <LoginForm />
}
