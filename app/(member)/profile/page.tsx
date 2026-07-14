import { db } from '@/lib/db'
import { requireMember } from '@/lib/auth'
import { updateOwnProfile } from '@/app/actions/profileActions'
import ChangePasswordForm from '@/components/ChangePasswordForm'
import { formatNZTime, todayNZDateString } from '@/lib/timezone'
import { getMonthlyRosteredHours } from '@/lib/roster-engine'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const sessionMember = await requireMember()

  const [member, recentLedger] = await Promise.all([
    db.member.findUnique({ where: { id: sessionMember.id } }),
    db.hourLedgerEntry.findMany({
      where: { memberId: sessionMember.id },
      orderBy: { recordedAt: 'desc' },
      take: 10,
    }),
  ])

  if (!member) return null

  const currentMonthStr = todayNZDateString().slice(0, 7)
  const monthlyRosteredHours = await getMonthlyRosteredHours(member.id, member.crewId, currentMonthStr)
  const monthLabel = new Date(`${currentMonthStr}-01T00:00:00Z`).toLocaleDateString('en-NZ', {
    month: 'long', timeZone: 'UTC',
  })

  return (
    <div className="max-w-2xl mx-auto space-y-6">
        {/* Read-only identity — username can only be changed by an admin */}
        <section className="bg-white rounded-xl border shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Identity</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Name</p>
              <p className="text-slate-800 font-medium">{member.firstName} {member.lastName}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Rank</p>
              <p className="text-slate-800 font-medium">{member.rank}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Username</p>
              <p className="text-slate-500 font-mono">{member.username}</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 italic">Can only be changed by an admin.</p>
        </section>

        {/* Editable contact details */}
        <section className="bg-white rounded-xl border shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Contact Details</h2>
          <form
            action={async (fd: FormData) => {
              'use server'
              await updateOwnProfile({
                email: fd.get('email') as string,
                phone: fd.get('phone') as string,
              })
            }}
            className="space-y-3 max-w-sm"
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500">Email</label>
              <input name="email" type="email" defaultValue={member.email ?? ''} placeholder="you@example.com" className="border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500">Phone</label>
              <input name="phone" type="tel" defaultValue={member.phone ?? ''} placeholder="021 234 5678" className="border rounded-lg px-3 py-2 text-sm" />
            </div>
            <button type="submit" className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-lg transition-colors">Save</button>
          </form>
        </section>

        {/* Password */}
        <section className="bg-white rounded-xl border shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Change Password</h2>
          <ChangePasswordForm />
        </section>

        {/* Hour stats */}
        <section className="bg-white rounded-xl border shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Hour Stats</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-lg p-3 border">
              <p className={`text-2xl font-bold ${member.hourBalance >= 0 ? 'text-green-600' : 'text-rose-600'}`}>
                {member.hourBalance >= 0 ? '+' : ''}{member.hourBalance}h
              </p>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mt-0.5">Current Balance</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border">
              <p className="text-2xl font-bold text-slate-700">
                {member.crewId ? `${monthlyRosteredHours}h` : '—'}
              </p>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mt-0.5">
                Rostered Hours ({monthLabel})
              </p>
            </div>
          </div>

          {recentLedger.length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-semibold text-slate-500 mb-2">Recent Adjustments</p>
              <ul className="space-y-1.5">
                {recentLedger.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">
                      {new Date(entry.recordedAt).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short' })}
                      {' · '}
                      {formatNZTime(entry.recordedAt)}
                      {' · '}
                      <span className="text-slate-400">{entry.reason}</span>
                    </span>
                    <span className={`font-mono font-bold ${entry.hoursChange >= 0 ? 'text-green-600' : 'text-rose-600'}`}>
                      {entry.hoursChange >= 0 ? '+' : ''}{entry.hoursChange}h
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
    </div>
  )
}
