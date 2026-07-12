import { db } from '@/lib/db'
import { requireMember } from '@/lib/auth'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function StatsPage() {
  const activeMember = await requireMember()

  const members = await db.member.findMany({
    where: { isActive: true },
    orderBy: [{ hourBalance: 'desc' }, { lastName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, rank: true, hourBalance: true },
  })

  // At least 1 so a brigade with every balance at 0 doesn't divide by zero —
  const maxAbsBalance = Math.max(1, ...members.map(m => Math.abs(m.hourBalance)))

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8 text-slate-900">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800">Brigade Hour Balance</h1>
          <Link href="/" className="text-xs font-semibold text-slate-500 hover:text-slate-700">← Back to Roster</Link>
        </div>

        <p className="text-xs text-slate-500 bg-white border rounded-lg px-4 py-3 shadow-sm">
          <span className="font-semibold text-green-600">Green</span> means you've covered more shifts than you've had covered —
          {' '}<span className="font-semibold text-rose-600">rose</span> means the opposite. Cover a shift for someone to bring your balance up.
        </p>

        {/* Skyline chart: whole-brigade shape at a glance, same order/colours as the ranked list below (which has the names and exact numbers). */}
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-3">Brigade Overview</p>
          <div className="h-32 flex flex-col">
            <div className="flex-1 flex items-end gap-px">
              {members.map(m => (
                <div key={m.id} className="flex-1 h-full flex items-end justify-center min-w-0">
                  {m.hourBalance >= 0 && (
                    <div
                      className={`w-full rounded-t ${m.id === activeMember.id ? 'bg-blue-500' : 'bg-green-500'}`}
                      style={{ height: `${(Math.abs(m.hourBalance) / maxAbsBalance) * 100}%` }}
                      title={`${m.lastName}, ${m.firstName.charAt(0)}. — ${m.hourBalance >= 0 ? '+' : ''}${m.hourBalance}h`}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="h-px bg-slate-300 w-full shrink-0" />
            <div className="flex-1 flex items-start gap-px">
              {members.map(m => (
                <div key={m.id} className="flex-1 h-full flex items-start justify-center min-w-0">
                  {m.hourBalance < 0 && (
                    <div
                      className={`w-full rounded-b ${m.id === activeMember.id ? 'bg-blue-500' : 'bg-rose-400'}`}
                      style={{ height: `${(Math.abs(m.hourBalance) / maxAbsBalance) * 100}%` }}
                      title={`${m.lastName}, ${m.firstName.charAt(0)}. — ${m.hourBalance}h`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm divide-y divide-slate-100">
          {members.map((m, i) => {
            const isYou = m.id === activeMember.id
            const isPositive = m.hourBalance >= 0
            const barWidthPct = Math.min(100, (Math.abs(m.hourBalance) / maxAbsBalance) * 100)

            return (
              <div
                key={m.id}
                className={`flex items-center gap-3 px-4 py-2.5 ${isYou ? 'bg-blue-50' : ''}`}
              >
                <span className="w-6 shrink-0 text-xs font-mono font-bold text-slate-400 text-center">
                  {i + 1}
                </span>

                <div className="w-28 sm:w-36 shrink-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {m.lastName}, {m.firstName.charAt(0)}.{isYou && <span className="text-blue-500"> (You)</span>}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono truncate">{m.rank}</p>
                </div>

                <div className="flex-1 flex items-center h-5 min-w-0">
                  <div className="flex-1 flex justify-end pr-0.5 h-full">
                    {!isPositive && (
                      <div
                        className="h-3 rounded-l bg-rose-400 self-center"
                        style={{ width: `${barWidthPct}%` }}
                      />
                    )}
                  </div>
                  <div className="w-px h-5 bg-slate-300 shrink-0" />
                  <div className="flex-1 flex justify-start pl-0.5 h-full">
                    {isPositive && (
                      <div
                        className="h-3 rounded-r bg-green-500 self-center"
                        style={{ width: `${barWidthPct}%` }}
                      />
                    )}
                  </div>
                </div>

                <span className={`w-14 shrink-0 text-right text-xs font-mono font-bold ${isPositive ? 'text-green-600' : 'text-rose-600'}`}>
                  {isPositive ? '+' : ''}{m.hourBalance}h
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
