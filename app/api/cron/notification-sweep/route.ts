import { NextRequest, NextResponse } from 'next/server'
import { runNotificationSweep } from '@/lib/notificationSweep'

// Vercel Cron (see vercel.json) calls this on a schedule and automatically
// Probs need to buy premium to test it
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (expected) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const result = await runNotificationSweep()
  return NextResponse.json({ ok: true, ...result })
}
