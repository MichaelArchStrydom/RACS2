import { db } from '@/lib/db'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { addMember } from '@/app/actions/adminActions'
import { requireAdmin } from '@/lib/auth'

interface PageProps {
  searchParams: Promise<{ user?: string; search?: string }>
}

const ZONE_LABELS: Record<string, string> = { GREEN: '🟢 Green', RED: '🔴 Red', SUBSTITUTE: '🔵 Sub' }

export default async function MembersPage({ searchParams }: PageProps) {
  const admin = await requireAdmin()
  const activeUserId = admin.id

  const { user: userId, search } = await searchParams
  if (!userId) redirect('/')

  const adminMember = await db.member.findUnique({ where: { id: userId } })
  if (!adminMember?.isAdmin) redirect('/')

  const [members, crews] = await Promise.all([
    db.member.findMany({
      where: search ? {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { rank: { contains: search, mode: 'insensitive' } },
        ]
      } : undefined,
      include: {
        crew: true,
        qualifications: { include: { qualification: true }, where: { isActive: true } },
      },
      orderBy: [{ isActive: 'desc' }, { lastName: 'asc' }],
    }),
    db.crew.findMany({ where: { isActive: true }, orderBy: { crewOrder: 'asc' } }),
  ])

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Members</h1>
          <p className="text-sm text-slate-500">{members.filter(m => m.isActive).length} active · {members.length} total</p>
        </div>
      </div>

      {/* Search */}
      <form method="GET" className="flex gap-2">
        <input type="hidden" name="user" value={userId} />
        <input
          name="search"
          defaultValue={search}
          placeholder="Search name or rank…"
          className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-400"
        />
        <button type="submit" className="px-4 py-2 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-700">Search</button>
        {search && <Link href={`/admin/members?user=${userId}`} className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-200">Clear</Link>}
      </form>

      {/* Add member form */}
      <details className="bg-white border rounded-xl shadow-sm">
        <summary className="px-5 py-4 cursor-pointer text-sm font-semibold text-slate-700 hover:text-rose-600">+ Add New Member</summary>
        <form
          action={async (fd: FormData) => {
            'use server'
            await addMember(fd.get('adminId') as string, {
              firstName: fd.get('firstName') as string,
              lastName: fd.get('lastName') as string,
              email: fd.get('email') as string,
              rank: fd.get('rank') as string,
              crewId: fd.get('crewId') as string || null,
              zoneType: fd.get('zoneType') as string,
              isDriver: fd.get('isDriver') === 'on',
              isOfficer: fd.get('isOfficer') === 'on',
            })
          }}
          className="px-5 pb-5 grid grid-cols-2 md:grid-cols-3 gap-3"
        >
          <input type="hidden" name="adminId" value={userId} />
          <input name="firstName" placeholder="First name" required className="border rounded-lg px-3 py-2 text-sm" />
          <input name="lastName" placeholder="Last name" required className="border rounded-lg px-3 py-2 text-sm" />
          <input name="email" placeholder="Email" required type="email" className="border rounded-lg px-3 py-2 text-sm" />
          <input name="rank" placeholder="Rank (e.g. FF, SFF, SO)" required className="border rounded-lg px-3 py-2 text-sm" />
          <select name="crewId" className="border rounded-lg px-3 py-2 text-sm">
            <option value="">No crew</option>
            {crews.map(c => <option key={c.id} value={c.id}>{c.watchName}</option>)}
          </select>
          <select name="zoneType" className="border rounded-lg px-3 py-2 text-sm">
            <option value="GREEN">Green Zone</option>
            <option value="RED">Red Zone</option>
            <option value="SUBSTITUTE">Substitute</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600 col-span-1">
            <input type="checkbox" name="isOfficer" className="rounded" /> Is Officer (OIC eligible)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600 col-span-1">
            <input type="checkbox" name="isDriver" className="rounded" /> Is Driver
          </label>
          <button type="submit" className="col-span-2 md:col-span-3 mt-1 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white font-semibold text-sm rounded-lg transition-colors">
            Add Member
          </button>
        </form>
      </details>

      {/* Member table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Rank</th>
              <th className="px-4 py-3 text-left">Crew</th>
              <th className="px-4 py-3 text-left">Zone</th>
              <th className="px-4 py-3 text-left">Qualifications</th>
              <th className="px-4 py-3 text-left">Balance</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map(m => (
              <tr key={m.id} className={`hover:bg-slate-50 transition-colors ${!m.isActive ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium text-slate-800">{m.lastName}, {m.firstName}</td>
                <td className="px-4 py-3 text-slate-500 font-mono text-xs">{m.rank}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{m.crew?.watchName ?? <span className="italic text-slate-300">None</span>}</td>
                <td className="px-4 py-3 text-xs">{ZONE_LABELS[m.zoneType] ?? m.zoneType}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {m.qualifications.slice(0, 4).map(mq => (
                      <span key={mq.id} className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-mono">
                        {mq.qualification.name}
                      </span>
                    ))}
                    {m.qualifications.length > 4 && (
                      <span className="text-[10px] text-slate-400">+{m.qualifications.length - 4}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-mono font-bold ${m.hourBalance >= 0 ? 'text-green-600' : 'text-rose-600'}`}>
                    {m.hourBalance >= 0 ? '+' : ''}{m.hourBalance}h
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${m.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {m.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/members/${m.id}?user=${userId}`}
                    className="text-xs font-semibold text-rose-600 hover:underline"
                  >
                    Edit →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
