export const dynamic = 'force-dynamic'
import { db } from '@/lib/db'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { approveLeave, rejectLeave, cancelLeave, createLeave } from '@/app/actions/adminActions'
import { requireAdmin } from '@/lib/auth'

interface PageProps {
  searchParams: Promise<{ user?: string; filter?: string }>
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-rose-100 text-rose-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
}

const LEAVE_TYPES = ['ANNUAL', 'SICK', 'UNPAID', 'SPECIAL', 'OTHER']

export default async function LeavePage({ searchParams }: PageProps) {
  const admin = await requireAdmin()
  const activeUserId = admin.id
  const { user: userId, filter = 'PENDING' } = await searchParams
  if (!userId) redirect('/')

  const adminMember = await db.member.findUnique({ where: { id: userId } })
  if (!adminMember?.isAdmin) redirect('/')

  const [leaveRecords, activeMembers, pendingCount] = await Promise.all([
    db.memberLeave.findMany({
      where: filter === 'ALL' ? undefined : { status: filter },
      include: {
        member: { select: { firstName: true, lastName: true, id: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.member.findMany({
      where: { isActive: true },
      orderBy: { lastName: 'asc' },
      select: { id: true, firstName: true, lastName: true, rank: true },
    }),
    db.memberLeave.count({ where: { status: 'PENDING' } }),
  ])

  const filters = [
    { label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}`, value: 'PENDING' },
    { label: 'Approved', value: 'APPROVED' },
    { label: 'Rejected', value: 'REJECTED' },
    { label: 'All', value: 'ALL' },
  ]

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Create leave (admin-initiated, auto-approved) */}
      <details className="bg-white border rounded-xl shadow-sm">
        <summary className="px-5 py-4 cursor-pointer text-sm font-semibold text-slate-700 hover:text-rose-600">
          + Record Leave for a Member
        </summary>
        <form
          action={async (fd: FormData) => {
            'use server'
            await createLeave(fd.get('adminId') as string, {
              memberId: fd.get('memberId') as string,
              startDate: new Date(fd.get('startDate') as string),
              endDate: new Date(fd.get('endDate') as string),
              leaveType: fd.get('leaveType') as string,
              notes: (fd.get('notes') as string) || undefined,
            })
          }}
          className="px-5 pb-5 grid grid-cols-2 md:grid-cols-3 gap-3"
        >
          <input type="hidden" name="adminId" value={userId} />

          <div className="flex flex-col gap-1 col-span-2 md:col-span-1">
            <label className="text-xs font-semibold text-slate-500">Member</label>
            <select name="memberId" required className="border rounded-lg px-3 py-2 text-sm">
              <option value="">— select member —</option>
              {activeMembers.map((m: any) => (
                <option key={m.id} value={m.id}>{m.lastName}, {m.firstName} ({m.rank})</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">Leave Type</label>
            <select name="leaveType" className="border rounded-lg px-3 py-2 text-sm">
              {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">Start Date</label>
            <input name="startDate" type="date" required className="border rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">End Date</label>
            <input name="endDate" type="date" required className="border rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="flex flex-col gap-1 col-span-2">
            <label className="text-xs font-semibold text-slate-500">Notes (optional)</label>
            <input name="notes" placeholder="Reason or context" className="border rounded-lg px-3 py-2 text-sm" />
          </div>

          <button type="submit" className="col-span-2 md:col-span-3 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-lg transition-colors">
            Record Leave (auto-approved)
          </button>
        </form>
      </details>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {filters.map((f: any) => (
          <Link
            key={f.value}
            href={`/admin/leave?user=${userId}&filter=${f.value}`}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${filter === f.value
              ? 'bg-slate-800 text-white border-slate-800'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Leave records */}
      {leaveRecords.length === 0 ? (
        <p className="text-sm text-slate-400 italic py-8 text-center">No {filter === 'ALL' ? '' : filter.toLowerCase()} leave records.</p>
      ) : (
        <div className="space-y-3">
          {leaveRecords.map((leave: any) => (
            <section key={leave.id} className="bg-white rounded-xl border shadow-sm p-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">

                {/* Info */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/admin/members/${leave.member.id}?user=${userId}`}
                      className="font-semibold text-slate-800 hover:text-rose-600 transition-colors"
                    >
                      {leave.member.lastName}, {leave.member.firstName}
                    </Link>
                    <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {leave.leaveType}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[leave.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {leave.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 font-mono">
                    {new Date(leave.startDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' → '}
                    {new Date(leave.endDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                  {leave.notes && (
                    <p className="text-xs text-slate-400 italic">"{leave.notes}"</p>
                  )}
                  {leave.adminNotes && (
                    <p className="text-xs text-slate-500">Admin: {leave.adminNotes}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-wrap shrink-0">
                  {leave.status === 'PENDING' && (
                    <>
                      <form action={async (fd: FormData) => {
                        'use server'
                        await approveLeave(fd.get('adminId') as string, fd.get('leaveId') as string, fd.get('adminNotes') as string || undefined)
                      }} className="flex gap-1">
                        <input type="hidden" name="adminId" value={userId} />
                        <input type="hidden" name="leaveId" value={leave.id} />
                        <input name="adminNotes" placeholder="Optional note" className="border rounded-lg px-2 py-1 text-xs w-32" />
                        <button type="submit" className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-lg whitespace-nowrap">
                          ✓ Approve
                        </button>
                      </form>

                      <form action={async (fd: FormData) => {
                        'use server'
                        await rejectLeave(fd.get('adminId') as string, fd.get('leaveId') as string, fd.get('adminNotes') as string || undefined)
                      }} className="flex gap-1">
                        <input type="hidden" name="adminId" value={userId} />
                        <input type="hidden" name="leaveId" value={leave.id} />
                        <input name="adminNotes" placeholder="Reason for rejection" className="border rounded-lg px-2 py-1 text-xs w-32" />
                        <button type="submit" className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold rounded-lg whitespace-nowrap">
                          ✕ Reject
                        </button>
                      </form>
                    </>
                  )}

                  {(leave.status === 'PENDING' || leave.status === 'APPROVED') && (
                    <form action={async (fd: FormData) => {
                      'use server'
                      await cancelLeave(fd.get('adminId') as string, fd.get('leaveId') as string)
                    }}>
                      <input type="hidden" name="adminId" value={userId} />
                      <input type="hidden" name="leaveId" value={leave.id} />
                      <button type="submit" className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg">
                        Cancel
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
