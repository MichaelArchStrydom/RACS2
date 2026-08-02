import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { sendTestPushToAllMembers } from '@/app/actions/pushActions'
import { requireAdmin } from '@/lib/auth'
import { Bell } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ user?: string; success?: string; error?: string }>
}

export default async function AdminNotificationsPage({ searchParams }: PageProps) {
  const admin = await requireAdmin()

  const { user: userId, success, error } = await searchParams
  if (!userId) redirect('/')

  const adminMember = await db.member.findUnique({ where: { id: userId } })
  if (!adminMember?.isAdmin) redirect('/')

  const subscribedCount = await db.pushSubscription.findMany({ select: { memberId: true } })
    .then((rows) => new Set(rows.map((r) => r.memberId)).size)

  return (
    <div className="space-y-6">
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm font-medium px-4 py-3 rounded-lg">
          ✓ {decodeURIComponent(success)}
        </div>
      )}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium px-4 py-3 rounded-lg">
          ✕ {decodeURIComponent(error)}
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Bell className="w-4 h-4" /> Push Notifications
        </h2>
        <p className="text-xs text-slate-500">
          {subscribedCount} {subscribedCount === 1 ? 'member has' : 'members have'} at least one device subscribed to push notifications.
        </p>
        <form
          action={async (fd: FormData) => {
            'use server'
            try {
              const count = await sendTestPushToAllMembers(fd.get('adminId') as string)
              redirect(`/admin/notifications?user=${fd.get('adminId')}&success=${encodeURIComponent(`Test notification sent to ${count} subscribed member(s)`)}`)
            } catch (e: any) {
              if (e?.digest?.startsWith('NEXT_REDIRECT')) throw e
              redirect(`/admin/notifications?user=${fd.get('adminId')}&error=${encodeURIComponent(e.message ?? 'Unknown error')}`)
            }
          }}
        >
          <input type="hidden" name="adminId" value={userId} />
          <button
            type="submit"
            disabled={subscribedCount === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-500 hover:bg-rose-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Bell className="w-4 h-4" /> Ping All Subscribed Members
          </button>
        </form>
        {subscribedCount === 0 && (
          <p className="text-xs text-slate-400 italic">No members have enabled notifications yet — nothing to ping.</p>
        )}
      </div>
    </div>
  )
}
