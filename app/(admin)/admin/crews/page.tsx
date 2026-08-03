export const dynamic = 'force-dynamic'
import { db } from '@/lib/db'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { addCrew, updateCrew, moveMemberToCrew, reorderCrews } from '@/app/actions/adminActions'
import { requireAdmin } from '@/lib/auth'
import { epochDayIndex } from '@/lib/roster-engine'
import { todayNZDateString } from '@/lib/timezone'
import { TriangleAlert } from 'lucide-react'

interface PageProps {
  searchParams: Promise<{ user?: string; success?: string; error?: string }>
}

export default async function CrewsPage({ searchParams }: PageProps) {
  const admin = await requireAdmin()
  const activeUserId = admin.id

  const { user: userId, success, error } = await searchParams
  if (!userId) redirect('/')

  const adminMember = await db.member.findUnique({ where: { id: userId } })
  if (!adminMember?.isAdmin) redirect('/')

  const [crews, unassignedMembers] = await Promise.all([
    db.crew.findMany({
      // Same ordering (crewOrder asc, id asc as a stable tiebreak) the roster
      // engine itself sorts by — the Rotation Order tool below needs to see
      // crews in the exact sequence generateRosterForDateRange will use.
      orderBy: [{ crewOrder: 'asc' }, { id: 'asc' }],
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

  const todayStr = todayNZDateString()
  const crewCount = crews.length
  const todayBase = crewCount > 0 ? ((epochDayIndex(todayStr) % crewCount) + crewCount) % crewCount : 0
  // Position 1 = on duty today, position 2 = on duty tomorrow, etc. — the
  // intuitive ordering admins think in, independent of the raw stored
  // crewOrder integer that anchors the eternal rotation cycle.
  const positionFromToday = new Map(
    crews.map((crew: any, j: number) => [crew.id, ((j - todayBase + crewCount) % crewCount) + 1])
  )

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

      <p className="text-sm text-slate-500">{allActiveCrews.length} active crews</p>

      {/* Add crew */}
      <details className="bg-white border rounded-xl shadow-sm">
        <summary className="px-5 py-4 cursor-pointer text-sm font-semibold text-slate-700 hover:text-rose-600">+ Add New Crew</summary>
        <form
          action={async (fd: FormData) => {
            'use server'
            try {
              await addCrew(fd.get('adminId') as string, fd.get('watchName') as string)
              redirect(`/admin/crews?user=${fd.get('adminId')}&success=${encodeURIComponent('Crew added — set its rotation position below')}`)
            } catch (e: any) {
              if (e?.digest?.startsWith('NEXT_REDIRECT')) throw e
              redirect(`/admin/crews?user=${fd.get('adminId')}&error=${encodeURIComponent(e.message ?? 'Unknown error')}`)
            }
          }}
          className="px-5 pb-5 flex gap-3 items-end"
        >
          <input type="hidden" name="adminId" value={userId} />
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs font-semibold text-slate-500">Watch Name</label>
            <input name="watchName" placeholder="e.g. Gold Watch" required className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-lg transition-colors">Add</button>
        </form>
      </details>

      {/* Rotation order */}
      <details className="bg-white border rounded-xl shadow-sm" open>
        <summary className="px-5 py-4 cursor-pointer text-sm font-semibold text-slate-700 hover:text-rose-600">Rotation Order</summary>
        <div className="px-5 pb-5 space-y-4">
          <p className="text-xs text-slate-500">
            Position 1 is whoever&apos;s on duty on the date below, position 2 the day after, and so on,
            cycling through all {crewCount} crews forever. Numbers are pre-filled with today&apos;s actual
            order — change the date first if you want to set positions relative to a different day, then
            generate the roster starting from whichever date you like; the cycle keeps going from there.
          </p>
          <form
            action={async (fd: FormData) => {
              'use server'
              try {
                const referenceDateStr = fd.get('referenceDate') as string
                const positions = crews.map((c: any) => ({
                  crewId: c.id as string,
                  position: Number(fd.get(`position-${c.id}`)),
                }))
                if (positions.some((p) => !Number.isInteger(p.position) || p.position < 1 || p.position > crews.length)) {
                  throw new Error(`Positions must be whole numbers from 1 to ${crews.length}.`)
                }
                if (new Set(positions.map((p) => p.position)).size !== positions.length) {
                  throw new Error('Each position number must be used exactly once.')
                }
                const orderedCrewIds = [...positions].sort((a, b) => a.position - b.position).map((p) => p.crewId)
                await reorderCrews(fd.get('adminId') as string, referenceDateStr, orderedCrewIds)
                redirect(`/admin/crews?user=${fd.get('adminId')}&success=${encodeURIComponent('Rotation order updated')}`)
              } catch (e: any) {
                if (e?.digest?.startsWith('NEXT_REDIRECT')) throw e
                redirect(`/admin/crews?user=${fd.get('adminId')}&error=${encodeURIComponent(e.message ?? 'Unknown error')}`)
              }
            }}
            className="space-y-4"
          >
            <input type="hidden" name="adminId" value={userId} />
            <div className="flex flex-col gap-1 w-48">
              <label className="text-xs font-semibold text-slate-500">Starting from date</label>
              <input name="referenceDate" type="date" defaultValue={todayStr} required className="border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
              {crews.map((crew: any) => (
                <div key={crew.id} className="flex items-center gap-2">
                  <input
                    name={`position-${crew.id}`}
                    type="number"
                    min={1}
                    max={crews.length}
                    defaultValue={positionFromToday.get(crew.id)}
                    required
                    className="w-14 border rounded-lg px-2 py-1 text-sm text-center"
                  />
                  <span className="text-sm text-slate-700">{crew.watchName}</span>
                </div>
              ))}
            </div>
            <button type="submit" className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-lg transition-colors">Save Order</button>
          </form>
        </div>
      </details>

      {/* Unassigned members */}
      {unassignedMembers.length > 0 && (
        <details className="px-5 py-4 bg-amber-50 border border-amber-200 rounded-xl">
          <summary className="cursor-pointer text-sm font-semibold text-amber-800 hover:text-rose-600 inline-flex items-center gap-1.5" ><TriangleAlert className="w-4 h-4" /> Crewless Members ({unassignedMembers.length})</summary>
          <div className="space-y-2">
            {unassignedMembers.map((m: any) => (
              <form
                key={m.id}
                action={async (fd: FormData) => {
                  'use server'
                  try {
                    await moveMemberToCrew(fd.get('adminId') as string, fd.get('memberId') as string, fd.get('crewId') as string || null)
                    redirect(`/admin/crews?user=${fd.get('adminId')}&success=${encodeURIComponent('Member assigned')}`)
                  } catch (e: any) {
                    if (e?.digest?.startsWith('NEXT_REDIRECT')) throw e
                    redirect(`/admin/crews?user=${fd.get('adminId')}&error=${encodeURIComponent(e.message ?? 'Unknown error')}`)
                  }
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
                <p className="text-xs text-slate-400">
                  {positionFromToday.get(crew.id) === 1 ? 'On duty today' : `#${positionFromToday.get(crew.id)} from today`} · {crew.members.length} members
                </p>
              </div>
              <form
                action={async (fd: FormData) => {
                  'use server'
                  try {
                    await updateCrew(fd.get('adminId') as string, fd.get('crewId') as string, {
                      isActive: fd.get('isActive') !== 'true'
                    })
                    redirect(`/admin/crews?user=${fd.get('adminId')}&success=${encodeURIComponent('Crew status updated')}`)
                  } catch (e: any) {
                    if (e?.digest?.startsWith('NEXT_REDIRECT')) throw e
                    redirect(`/admin/crews?user=${fd.get('adminId')}&error=${encodeURIComponent(e.message ?? 'Unknown error')}`)
                  }
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
                try {
                  await updateCrew(fd.get('adminId') as string, fd.get('crewId') as string, {
                    watchName: fd.get('watchName') as string,
                  })
                  redirect(`/admin/crews?user=${fd.get('adminId')}&success=${encodeURIComponent('Crew updated')}`)
                } catch (e: any) {
                  if (e?.digest?.startsWith('NEXT_REDIRECT')) throw e
                  redirect(`/admin/crews?user=${fd.get('adminId')}&error=${encodeURIComponent(e.message ?? 'Unknown error')}`)
                }
              }}
              className="flex gap-2"
            >
              <input type="hidden" name="adminId" value={userId} />
              <input type="hidden" name="crewId" value={crew.id} />
              <input name="watchName" defaultValue={crew.watchName} className="flex-1 border rounded-lg px-2 py-1 text-sm" />
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
