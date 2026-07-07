import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { addPublicHoliday, deletePublicHoliday } from '@/app/actions/adminActions'
import { requireAdmin } from '@/lib/auth'
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ user?: string }>
}

export default async function HolidaysPage({ searchParams }: PageProps) {
  const admin = await requireAdmin()
  const activeUserId = admin.id

  const { user: userId } = await searchParams
  if (!userId) redirect('/')

  const adminMember = await db.member.findUnique({ where: { id: userId } })
  if (!adminMember?.isAdmin) redirect('/')

  const holidays = await db.publicHoliday.findMany({ orderBy: { date: 'asc' } })

  const upcoming = holidays.filter((h: any) => new Date(h.date) >= new Date())
  const past = holidays.filter((h: any) => new Date(h.date) < new Date())

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-800">Public Holidays</h1>
      <p className="text-sm text-slate-500">
        Holidays marked as WEEKEND will be treated like weekend shifts (07:00–07:00) by the roster engine when regenerating.
        Existing slots are not retroactively changed.
      </p>

      {/* Add holiday */}
      <section className="bg-white rounded-xl border shadow-sm p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Add Public Holiday</h2>
        <form
          action={async (fd: FormData) => {
            'use server'
            await addPublicHoliday(fd.get('adminId') as string, {
              date: new Date(fd.get('date') as string),
              name: fd.get('name') as string,
              shiftType: fd.get('shiftType') as string,
              notes: (fd.get('notes') as string) || undefined,
            })
          }}
          className="grid grid-cols-2 gap-3"
        >
          <input type="hidden" name="adminId" value={userId} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">Date</label>
            <input name="date" type="date" required className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">Shift Treatment</label>
            <select name="shiftType" className="border rounded-lg px-3 py-2 text-sm">
              <option value="WEEKEND">Weekend (07:00–07:00)</option>
              <option value="WEEKDAY">Weekday (17:30–07:00)</option>
              <option value="SPECIAL">Special (manual)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <label className="text-xs font-semibold text-slate-500">Name</label>
            <input name="name" required placeholder="e.g. Waitangi Day" className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <label className="text-xs font-semibold text-slate-500">Notes (optional)</label>
            <input name="notes" placeholder="Any special instructions" className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="col-span-2 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-lg">Add Holiday</button>
        </form>
      </section>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section className="bg-white rounded-xl border shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Upcoming</h2>
          <ul className="space-y-2">
            {upcoming.map((h: any) => (
              <li key={h.id} className="flex items-center justify-between text-sm py-2 border-b border-slate-100 last:border-0">
                <div>
                  <span className="font-medium text-slate-800">{h.name}</span>
                  <span className="ml-2 text-xs text-slate-400 font-mono">
                    {new Date(h.date).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <span className="ml-2 text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-semibold">{h.shiftType}</span>
                </div>
                <form action={async (fd: FormData) => { 'use server'; await deletePublicHoliday(fd.get('adminId') as string, fd.get('holidayId') as string) }}>
                  <input type="hidden" name="adminId" value={userId} />
                  <input type="hidden" name="holidayId" value={h.id} />
                  <button type="submit" className="text-xs text-rose-500 hover:text-rose-700 font-semibold">Delete</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Past */}
      {past.length > 0 && (
        <details className="bg-white rounded-xl border shadow-sm">
          <summary className="px-5 py-4 cursor-pointer text-sm font-semibold text-slate-500">Past holidays ({past.length})</summary>
          <ul className="px-5 pb-5 space-y-2">
            {[...past].reverse().map(h => (
              <li key={h.id} className="flex items-center justify-between text-sm text-slate-400 py-1.5 border-b border-slate-100 last:border-0">
                <span>{h.name} · {new Date(h.date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <form action={async (fd: FormData) => { 'use server'; await deletePublicHoliday(fd.get('adminId') as string, fd.get('holidayId') as string) }}>
                  <input type="hidden" name="adminId" value={userId} />
                  <input type="hidden" name="holidayId" value={h.id} />
                  <button type="submit" className="text-xs text-rose-400 hover:text-rose-600">Delete</button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
