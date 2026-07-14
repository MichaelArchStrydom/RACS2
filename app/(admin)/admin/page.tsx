import { db } from '@/lib/db'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'


interface PageProps {
  searchParams: Promise<{ user?: string }>
}

export default async function AdminDashboard({ searchParams }: PageProps) {
  const admin = await requireAdmin()
  const activeUserId = admin.id
  const { user: userId } = await searchParams
  if (!userId) redirect(`/?error=no-user`)

  const adminMember = await db.member.findUnique({ where: { id: userId } })
  if (!adminMember?.isAdmin) redirect(`/?error=not-admin`)

  const [
    totalMembers,
    activeMembers,
    totalCrews,
    pendingLeave,
    pendingRequests,
    upcomingHolidays,
    recentLedger,
  ] = await Promise.all([
    db.member.count(),
    db.member.count({ where: { isActive: true } }),
    db.crew.count({ where: { isActive: true } }),
    db.memberLeave.count({ where: { status: 'PENDING' } }),
    db.standInRequest.count({ where: { status: 'PENDING' } }),
    db.publicHoliday.findMany({
      where: { date: { gte: new Date() } },
      orderBy: { date: 'asc' },
      take: 5,
    }),
    db.hourLedgerEntry.findMany({
      orderBy: { recordedAt: 'desc' },
      take: 8,
      include: { member: { select: { firstName: true, lastName: true } } }
    }),
  ])

  const stats = [
    { label: 'Active Members', value: activeMembers, total: totalMembers, href: '/admin/members', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { label: 'Active Crews', value: totalCrews, href: '/admin/crews', color: 'bg-green-50 text-green-700 border-green-200' },
    { label: 'Pending Leave', value: pendingLeave, href: '/admin/leave', color: pendingLeave > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200' },
    { label: 'Open Requests', value: pendingRequests, href: '/', color: pendingRequests > 0 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-600 border-slate-200' },
  ]

  return (
    <div className="space-y-8">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(s => (
          <Link
            key={s.label}
            href={`${s.href}?user=${userId}`}
            className={`border rounded-xl p-4 flex flex-col gap-1 hover:shadow-sm transition-shadow ${s.color}`}
          >
            <span className="text-3xl font-bold">{s.value}</span>
            {'total' in s && s.total !== s.value && (
              <span className="text-xs opacity-70">of {s.total} total</span>
            )}
            <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{s.label}</span>
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Upcoming public holidays */}
        <section className="bg-white rounded-xl border shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Upcoming Public Holidays</h2>
            <Link href={`/admin/holidays?user=${userId}`} className="text-xs text-rose-600 hover:underline">Manage →</Link>
          </div>
          {upcomingHolidays.length === 0 ? (
            <p className="text-xs text-slate-400 italic">None recorded</p>
          ) : (
            <ul className="space-y-2">
              {upcomingHolidays.map(h => (
                <li key={h.id} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{h.name}</span>
                  <span className="text-slate-400 font-mono">
                    {new Date(h.date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent hour ledger */}
        <section className="bg-white rounded-xl border shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Recent Hour Adjustments</h2>
            <Link href={`/admin/members?user=${userId}`} className="text-xs text-rose-600 hover:underline">View Members →</Link>
          </div>
          {recentLedger.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No ledger entries yet</p>
          ) : (
            <ul className="space-y-2">
              {recentLedger.map(e => (
                <li key={e.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 font-medium">{e.member.lastName}, {e.member.firstName}</span>
                  <span className={`font-mono font-bold ${e.hoursChange >= 0 ? 'text-green-600' : 'text-rose-600'}`}>
                    {e.hoursChange >= 0 ? '+' : ''}{e.hoursChange}h
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Quick links */}
      <section className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/roster?user=${userId}`} className="px-3 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-700 transition-colors">⚙️ Generate Roster</Link>
          <Link href={`/admin/leave?user=${userId}`} className="px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 transition-colors">🏖️ Review Leave</Link>
          <Link href={`/admin/members?user=${userId}`} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors">🧑‍🚒 Manage Members</Link>
          <Link href={`/admin/holidays?user=${userId}`} className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors">📅 Add Holiday</Link>
        </div>
      </section>
    </div>
  )
}
