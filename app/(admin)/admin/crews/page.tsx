export const dynamic = 'force-dynamic'
import { db } from '@/lib/db'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { addCrew, updateCrew, moveMemberToCrew } from '@/app/actions/adminActions'
import { requireAdmin } from '@/lib/auth'

interface PageProps {
  searchParams: Promise<{ user?: string }>
}

export default async function CrewsPage({ searchParams }: PageProps) {
  const admin = await requireAdmin()
  const activeUserId = admin.id

  const { user: userId } = await searchParams
  if (!userId) redirect('/')

  const adminMember = await db.member.findUnique({ where: { id: userId } })
  if (!adminMember?.isAdmin) redirect('/')

  const [crews, unassignedMembers] = await Promise.all([
    db.crew.findMany({
      orderBy: { crewOrder: 'asc' },
      include: {
        members: {
          where: { isActive: true },
          orderBy: { lastName: 'asc' },
        }
      }
    }),
    db.member.findMany({
      where: { isActive: true, crewId: null },
      orderBy: { lastName: 'asc' },
    }),
  ])

  const allActiveCrews = crews.filter((c: any) => c.isActive)

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <p className="text-sm text-slate-500">{allActiveCrews.length} active crews</p>

      {/* Add crew */}
      <details className="bg-white border rounded-xl shadow-sm">
        <summary className="px-5 py-4 cursor-pointer text-sm font-semibold text-slate-700 hover:text-rose-600">+ Add New Crew</summary>
        <form
          action={async (fd: FormData) => {
            'use server'
            await addCrew(fd.get('adminId') as string, fd.get('watchName') as string, Number(fd.get('crewOrder')))
          }}
          className="px-5 pb-5 flex gap-3 items-end"
        >
          <input type="hidden" name="adminId" value={userId} />
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs font-semibold text-slate-500">Watch Name</label>
            <input name="watchName" placeholder="e.g. Gold Watch" required className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1 w-28">
            <label className="text-xs font-semibold text-slate-500">Rotation Order</label>
            <input name="crewOrder" type="number" defaultValue={crews.length + 1} required className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-lg transition-colors">Add</button>
        </form>
      </details>

      {/* Unassigned members */}
      {unassignedMembers.length > 0 && (
        <details className="px-5 py-4 bg-amber-50 border border-amber-200 rounded-xl">
          <summary className="cursor-pointer text-sm font-semibold text-amber-800 hover:text-rose-600" >⚠️ Crewless Members ({unassignedMembers.length})</summary>
          <div className="space-y-2">
            {unassignedMembers.map((m: any) => (
              <form
                key={m.id}
                action={async (fd: FormData) => {
                  'use server'
                  await moveMemberToCrew(fd.get('adminId') as string, fd.get('memberId') as string, fd.get('crewId') as string || null)
                }}
                className="flex items-center gap-3"
              >
                <input type="hidden" name="adminId" value={userId} />
                <input type="hidden" name="memberId" value={m.id} />
                <span className="text-sm text-slate-700 font-medium w-40">{m.lastName}, {m.firstName}</span>
                <span className="text-xs text-slate-400 font-mono w-12">{m.rank}</span>
                <select name="crewId" className="flex-1 border rounded-lg px-2 py-1 text-sm">
                  <option value="">No crew</option>
                  {allActiveCrews.map((c: any) => <option key={c.id} value={c.id}>{c.watchName}</option>)}
                </select>
                <button type="submit" className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg">Assign</button>
              </form>
            ))}
          </div>
        </details>
      )}

      {/* Crew cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {crews.map((crew: any) => (
          <section key={crew.id} className={`bg-white rounded-xl border shadow-sm p-5 space-y-4 ${!crew.isActive ? 'opacity-60' : ''}`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-800">{crew.watchName}</h2>
                <p className="text-xs text-slate-400">Rotation position #{crew.crewOrder} · {crew.members.length} members</p>
              </div>
              <form
                action={async (fd: FormData) => {
                  'use server'
                  await updateCrew(fd.get('adminId') as string, fd.get('crewId') as string, {
                    isActive: fd.get('isActive') !== 'true'
                  })
                }}
              >
                <input type="hidden" name="adminId" value={userId} />
                <input type="hidden" name="crewId" value={crew.id} />
                <input type="hidden" name="isActive" value={String(crew.isActive)} />
                <button type="submit" className={`text-xs font-semibold px-2 py-1 rounded-full ${crew.isActive ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700' : 'bg-slate-100 text-slate-500 hover:bg-green-100 hover:text-green-700'}`}>
                  {crew.isActive ? 'Active' : 'Inactive'}
                </button>
              </form>
            </div>

            {/* Rename crew */}
            <form
              action={async (fd: FormData) => {
                'use server'
                await updateCrew(fd.get('adminId') as string, fd.get('crewId') as string, {
                  watchName: fd.get('watchName') as string,
                  crewOrder: Number(fd.get('crewOrder')),
                })
              }}
              className="flex gap-2"
            >
              <input type="hidden" name="adminId" value={userId} />
              <input type="hidden" name="crewId" value={crew.id} />
              <input name="watchName" defaultValue={crew.watchName} className="flex-1 border rounded-lg px-2 py-1 text-sm" />
              <input name="crewOrder" type="number" defaultValue={crew.crewOrder} className="w-14 border rounded-lg px-2 py-1 text-sm text-center" />
              <button type="submit" className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg">Save</button>
            </form>

            {/* Members list */}
            <div className="space-y-1">
              {crew.members.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                  <span className="text-slate-700">{m.lastName}, {m.firstName}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-400">{m.rank}</span>
                    <Link href={`/admin/members/${m.id}?user=${userId}`} className="text-rose-500 hover:underline">edit</Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
