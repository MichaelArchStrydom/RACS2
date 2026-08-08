import { NextRequest, NextResponse } from 'next/server'
import { runNotificationSweep } from '@/lib/notificationSweep'

// Vercel Cron (see vercel.json) calls this on a schedule and automatically
// Probs need to buy premium to test it
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  // Fail CLOSED, not open — this route is excluded from proxy.ts's cookie
  // gate (all of /api/ is), so it's otherwise fully public.
  if (!expected) {
    console.error('CRON_SECRET is not set — rejecting notification-sweep request.')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runNotificationSweep()
  return NextResponse.json({ ok: true, ...result })
}
