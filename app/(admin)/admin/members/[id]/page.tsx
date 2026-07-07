import { db } from '@/lib/db'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { updateMember, deactivateMember, setMemberQualification, addHourAdjustment } from '@/app/actions/adminActions'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ user?: string }>
}

const ZONE_LABELS: Record<string, string> = { GREEN: 'Green Zone', RED: 'Red Zone', SUBSTITUTE: 'Substitute' }

export default async function MemberDetailPage({ params, searchParams }: PageProps) {
  const { id: memberId } = await params
  const { user: userId } = await searchParams
  if (!userId) redirect('/')

  const adminMember = await db.member.findUnique({ where: { id: userId } })
  if (!adminMember?.isAdmin) redirect('/')

  const [member, crews, allQuals, leaveRecords, ledgerEntries] = await Promise.all([
    db.member.findUnique({
      where: { id: memberId },
      include: {
        crew: true,
        qualifications: {
          include: { qualification: true },
          orderBy: { awardedAt: 'desc' }
        },
      },
    }),
    db.crew.findMany({ where: { isActive: true }, orderBy: { crewOrder: 'asc' } }),
    db.qualification.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    db.memberLeave.findMany({
      where: { memberId },
      orderBy: { startDate: 'desc' },
      take: 10,
    }),
    db.hourLedgerEntry.findMany({
      where: { memberId },
      orderBy: { recordedAt: 'desc' },
      take: 20,
    }),
  ])

  if (!member) redirect('/admin/members')

  const memberQualKeys = new Set(
    member.qualifications.filter(mq => mq.isActive).map(mq => mq.qualification.key)
  )

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href={`/admin/members?user=${userId}`} className="text-sm text-slate-500 hover:text-slate-800">← Members</Link>
        <h1 className="text-2xl font-bold text-slate-800">{member.firstName} {member.lastName}</h1>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${member.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
          {member.isActive ? 'Active' : 'Inactive'}
        </span>
        {member.isAdmin && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Admin</span>}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* ── Core details form ── */}
        <section className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Core Details</h2>
          <form
            action={async (fd: FormData) => {
              'use server'
              await updateMember(fd.get('adminId') as string, fd.get('memberId') as string, {
                firstName: fd.get('firstName') as string,
                lastName: fd.get('lastName') as string,
                rank: fd.get('rank') as string,
                crewId: (fd.get('crewId') as string) || null,
                zoneType: fd.get('zoneType') as string,
                isActive: fd.get('isActive') === 'on',
                isAdmin: fd.get('isAdmin') === 'on',
                expectedHoursPerPeriod: fd.get('expectedHours') ? Number(fd.get('expectedHours')) : null,
              })
            }}
            className="space-y-3"
          >
            <input type="hidden" name="adminId" value={userId} />
            <input type="hidden" name="memberId" value={memberId} />

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500">First Name</label>
                <input name="firstName" defaultValue={member.firstName} required className="border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500">Last Name</label>
                <input name="lastName" defaultValue={member.lastName} required className="border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500">Rank</label>
              <input name="rank" defaultValue={member.rank} className="border rounded-lg px-3 py-2 text-sm" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500">Crew</label>
              <select name="crewId" defaultValue={member.crewId ?? ''} className="border rounded-lg px-3 py-2 text-sm">
                <option value="">No crew</option>
                {crews.map(c => <option key={c.id} value={c.id}>{c.watchName}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500">Zone Type</label>
              <select name="zoneType" defaultValue={member.zoneType} className="border rounded-lg px-3 py-2 text-sm">
                <option value="GREEN">Green Zone (normal)</option>
                <option value="RED">Red Zone (1st Due only)</option>
                [118;1:3u               <option value="SUBSTITUTE">Substitute (visitor)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500">Expected Hours / Period (leave blank for default)</label>
              <input name="expectedHours" type="number" step="0.5" defaultValue={member.expectedHoursPerPeriod ?? ''} placeholder="System default" className="border rounded-lg px-3 py-2 text-sm" />
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="isActive" defaultChecked={member.isActive} className="rounded" />
                Active member
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="isAdmin" defaultChecked={member.isAdmin} className="rounded" />
                Admin access
              </label>
            </div>

            <button type="submit" className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-lg transition-colors">
              Save Changes
            </button>
          </form>

          {member.isActive && (
            <form action={async (fd: FormData) => {
              'use server'
              await deactivateMember(fd.get('adminId') as string, fd.get('memberId') as string)
            }}>
              <input type="hidden" name="adminId" value={userId} />
              <input type="hidden" name="memberId" value={memberId} />
              <button type="submit" className="w-full py-2 border border-rose-300 text-rose-600 hover:bg-rose-50 text-sm font-semibold rounded-lg transition-colors">
                Deactivate Member
              </button>
            </form>
          )}
        </section>

        {/* ── Qualifications ── */}
        <section className="bg-white rounded-xl border shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Qualifications</h2>
          <p className="text-xs text-slate-400">Toggle qualifications on or off. OFFICER and DRIVER also update the roster engine flags.</p>
          <div className="space-y-2">
            {allQuals.map(q => {
              const hasQual = memberQualKeys.has(q.key)
              return (
                <form
                  key={q.id}
                  action={async (fd: FormData) => {
                    'use server'
                    await setMemberQualification(
                      fd.get('adminId') as string,
                      fd.get('memberId') as string,
                      fd.get('qualKey') as string,
                      fd.get('active') === 'true'
                    )
                  }}
                  className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0"
                >
                  <input type="hidden" name="adminId" value={userId} />
                  <input type="hidden" name="memberId" value={memberId} />
                  <input type="hidden" name="qualKey" value={q.key} />
                  <input type="hidden" name="active" value={hasQual ? 'false' : 'true'} />
                  <div>
                    <p className="text-sm font-medium text-slate-700">{q.name}</p>
                    {q.affectsRostering && <p className="text-[10px] text-blue-500">affects rostering</p>}
                  </div>
                  <button
                    type="submit"
                    className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${hasQual
                        ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
                        : 'bg-slate-100 text-slate-500 hover:bg-green-100 hover:text-green-700'
                      }`}
                  >
                    {hasQual ? '✓ Awarded' : '+ Award'}
                  </button>
                </form>
              )
            })}
          </div>
        </section>
      </div>

      {/* ── Hour ledger ── */}
      <section className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Hour Balance</h2>
            <p className={`text-2xl font-bold mt-0.5 ${member.hourBalance >= 0 ? 'text-green-600' : 'text-rose-600'}`}>
              {member.hourBalance >= 0 ? '+' : ''}{member.hourBalance}h
            </p>
          </div>
          {/* Manual adjustment */}
          <form
            action={async (fd: FormData) => {
              'use server'
              await addHourAdjustment(
                fd.get('adminId') as string,
                fd.get('memberId') as string,
                Number(fd.get('hours')),
                fd.get('notes') as string
              )
            }}
            className="flex gap-2 items-end"
          >
            <input type="hidden" name="adminId" value={userId} />
            <input type="hidden" name="memberId" value={memberId} />
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-500">Hours (+ or -)</label>
              <input name="hours" type="number" step="0.5" required placeholder="-2.5" className="w-20 border rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-500">Reason</label>
              <input name="notes" required placeholder="Manual adjustment" className="border rounded-lg px-2 py-1.5 text-sm w-36" />
            </div>
            <button type="submit" className="px-3 py-1.5 bg-slate-700 text-white text-xs font-semibold rounded-lg hover:bg-slate-600">
              Adjust
            </button>
          </form>
        </div>

        {ledgerEntries.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-left">Notes</th>
                  <th className="px-3 py-2 text-right">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledgerEntries.map(e => (
                  <tr key={e.id}>
                    <td className="px-3 py-2 font-mono text-slate-400">{new Date(e.recordedAt).toLocaleDateString('en-NZ')}</td>
                    <td className="px-3 py-2 text-slate-600">{e.reason.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2 text-slate-400 italic">{e.notes ?? '—'}</td>
                    <td className={`px-3 py-2 text-right font-mono font-bold ${e.hoursChange >= 0 ? 'text-green-600' : 'text-rose-600'}`}>
                      {e.hoursChange >= 0 ? '+' : ''}{e.hoursChange}h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Leave history ── */}
      {leaveRecords.length > 0 && (
        <section className="bg-white rounded-xl border shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Leave History</h2>
          <div className="space-y-2">
            {leaveRecords.map(l => (
              <div key={l.id} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-0">
                <div>
                  <span className="font-semibold text-slate-700">{l.leaveType}</span>
                  <span className="text-slate-400 ml-2">
                    {new Date(l.startDate).toLocaleDateString('en-NZ')} – {new Date(l.endDate).toLocaleDateString('en-NZ')}
                  </span>
                </div>
                <span className={`font-semibold px-2 py-0.5 rounded-full ${l.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                    l.status === 'REJECTED' ? 'bg-rose-100 text-rose-700' :
                      l.status === 'CANCELLED' ? 'bg-slate-100 text-slate-500' :
                        'bg-amber-100 text-amber-700'
                  }`}>{l.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
