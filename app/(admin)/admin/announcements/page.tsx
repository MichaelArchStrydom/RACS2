import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { createAnnouncement, updateAnnouncement, deleteAnnouncement } from '@/app/actions/adminActions'
import { requireAdmin } from '@/lib/auth'
import { formatNZTime } from '@/lib/timezone'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ user?: string; success?: string; error?: string }>
}

export default async function AnnouncementsAdminPage({ searchParams }: PageProps) {
  const admin = await requireAdmin()
  const activeUserId = admin.id

  const { user: userId, success, error } = await searchParams
  if (!userId) redirect('/')

  const adminMember = await db.member.findUnique({ where: { id: userId } })
  if (!adminMember?.isAdmin) redirect('/')

  const announcements = await db.announcement.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
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

      <p className="text-sm text-slate-500">
        Announcements shown to all members via the announcements panel on the roster board.
      </p>

      {/* Add announcement */}
      <details className="bg-white border rounded-xl shadow-sm">
        <summary className="px-5 py-4 cursor-pointer text-sm font-semibold text-slate-700 hover:text-rose-600">+ Add Announcement</summary>
        <form
          action={async (fd: FormData) => {
            'use server'
            try {
              await createAnnouncement(fd.get('adminId') as string, {
                title: fd.get('title') as string,
                body: fd.get('body') as string,
              })
              redirect(`/admin/announcements?user=${fd.get('adminId')}&success=${encodeURIComponent('Announcement posted')}`)
            } catch (e: any) {
              if (e?.digest?.startsWith('NEXT_REDIRECT')) throw e
              redirect(`/admin/announcements?user=${fd.get('adminId')}&error=${encodeURIComponent(e.message ?? 'Unknown error')}`)
            }
          }}
          className="px-5 pb-5 flex flex-col gap-3"
        >
          <input type="hidden" name="adminId" value={userId} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">Title</label>
            <input name="title" required placeholder="e.g. Matariki Friday 10th July" className="text-black border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">Body</label>
            <textarea name="body" required rows={4} placeholder="Details for members…" className="text-black border rounded-lg px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-lg">Post Announcement</button>
        </form>
      </details>

      {/* Existing announcements */}
      <div className="space-y-4">
        {announcements.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No announcements yet.</p>
        ) : (
          announcements.map((a) => (
            <section key={a.id} className="bg-white rounded-xl border shadow-sm p-5 space-y-3">
              <form
                action={async (fd: FormData) => {
                  'use server'
                  try {
                    await updateAnnouncement(fd.get('adminId') as string, fd.get('announcementId') as string, {
                      title: fd.get('title') as string,
                      body: fd.get('body') as string,
                    })
                    redirect(`/admin/announcements?user=${fd.get('adminId')}&success=${encodeURIComponent('Announcement updated')}`)
                  } catch (e: any) {
                    if (e?.digest?.startsWith('NEXT_REDIRECT')) throw e
                    redirect(`/admin/announcements?user=${fd.get('adminId')}&error=${encodeURIComponent(e.message ?? 'Unknown error')}`)
                  }
                }}
                className="space-y-3"
              >
                <input type="hidden" name="adminId" value={userId} />
                <input type="hidden" name="announcementId" value={a.id} />
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500">Title</label>
                  <input name="title" defaultValue={a.title} className="border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500">Body</label>
                  <textarea name="body" defaultValue={a.body} rows={3} className="text-black border rounded-lg px-3 py-2 text-sm" />

                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-mono">
                    Posted {formatNZTime(a.createdAt)} {new Date(a.createdAt).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', year: 'numeric' })}
                    {a.updatedById && a.updatedAt.getTime() !== a.createdAt.getTime() ? ' · edited' : ''}
                  </span>
                  <button type="submit" className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg">Save</button>
                </div>
              </form>
              <form action={async (fd: FormData) => {
                'use server'
                try {
                  await deleteAnnouncement(fd.get('adminId') as string, fd.get('announcementId') as string)
                  redirect(`/admin/announcements?user=${fd.get('adminId')}&success=${encodeURIComponent('Announcement removed')}`)
                } catch (e: any) {
                  if (e?.digest?.startsWith('NEXT_REDIRECT')) throw e
                  redirect(`/admin/announcements?user=${fd.get('adminId')}&error=${encodeURIComponent(e.message ?? 'Unknown error')}`)
                }
              }}>
                <input type="hidden" name="adminId" value={userId} />
                <input type="hidden" name="announcementId" value={a.id} />
                <button type="submit" className="text-xs text-rose-500 hover:text-rose-700 font-semibold">Delete</button>
              </form>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
