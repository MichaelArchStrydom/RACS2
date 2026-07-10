import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { createQualification, setQualificationActive } from '@/app/actions/adminActions'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const SEAT_ROLES = ["OIC", "Driver", "FF1", "FF2", "FF3"]

interface PageProps {
  searchParams: Promise<{ user?: string }>
}

export default async function QualificationsPage({ searchParams }: PageProps) {
  const admin = await requireAdmin()
  const activeUserId = admin.id

  const { user: userId } = await searchParams
  if (!userId) redirect('/')

  const adminMember = await db.member.findUnique({ where: { id: userId } })
  if (!adminMember?.isAdmin) redirect('/')

  const qualifications = await db.qualification.findMany({ orderBy: { name: 'asc' } })

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-800">Qualifications</h1>
      <p className="text-sm text-slate-500">
        Qualifications members can be awarded. The machine key can never be changed after creation — add a new
        qualification instead of renaming a key. Roles enabled here let the roster engine consider this qualification
        when assigning seats.
      </p>

      {/* Add qualification */}
      <details className="bg-white border rounded-xl shadow-sm">
        <summary className="px-5 py-4 cursor-pointer text-sm font-semibold text-slate-700 hover:text-rose-600">+ Add Qualification</summary>
        <form
          action={async (fd: FormData) => {
            'use server'
            await createQualification(fd.get('adminId') as string, {
              key: fd.get('key') as string,
              name: fd.get('name') as string,
              description: (fd.get('description') as string) || undefined,
              affectsRostering: fd.get('affectsRostering') === 'on',
              enabledRoles: SEAT_ROLES.filter((role) => fd.get(`role_${role}`) === 'on'),
            })
          }}
          className="px-5 pb-5 flex flex-col gap-3"
        >
          <input type="hidden" name="adminId" value={userId} />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500">Machine Key</label>
              <input name="key" required placeholder="e.g. BA_TELEMETRY" className="border rounded-lg px-3 py-2 text-sm font-mono" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500">Display Name</label>
              <input name="name" required placeholder="e.g. BA Telemetry" className="border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">Description (optional)</label>
            <input name="description" placeholder="Notes for the admin UI" className="border rounded-lg px-3 py-2 text-sm" />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="affectsRostering" className="rounded" />
            Affects rostering (roster engine considers this qualification when assigning seats)
          </label>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500">Enabled Roles (leave all unchecked for no seat restriction)</label>
            <div className="flex flex-wrap gap-3">
              {SEAT_ROLES.map((role) => (
                <label key={role} className="flex items-center gap-1.5 text-sm text-slate-600">
                  <input type="checkbox" name={`role_${role}`} className="rounded" />
                  {role}
                </label>
              ))}
            </div>
          </div>

          <button type="submit" className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-lg">Add Qualification</button>
        </form>
      </details>

      {/* Existing qualifications */}
      <div className="bg-white rounded-xl border shadow-sm divide-y divide-slate-100">
        {qualifications.length === 0 ? (
          <p className="text-sm text-slate-400 italic p-5">No qualifications yet.</p>
        ) : (
          qualifications.map((q) => (
            <div key={q.id} className={`p-4 flex items-center justify-between gap-3 ${!q.isActive ? 'opacity-50' : ''}`}>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {q.name} <span className="text-xs text-slate-400 font-mono font-normal">({q.key})</span>
                </p>
                {q.description && <p className="text-xs text-slate-500">{q.description}</p>}
                <div className="flex flex-wrap gap-1 mt-1">
                  {q.affectsRostering && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-semibold">affects rostering</span>}
                  {q.enabledRoles.map((role) => (
                    <span key={role} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">{role}</span>
                  ))}
                </div>
              </div>
              <form action={async (fd: FormData) => {
                'use server'
                await setQualificationActive(fd.get('adminId') as string, fd.get('qualId') as string, fd.get('active') === 'true')
              }}>
                <input type="hidden" name="adminId" value={userId} />
                <input type="hidden" name="qualId" value={q.id} />
                <input type="hidden" name="active" value={q.isActive ? 'false' : 'true'} />
                <button
                  type="submit"
                  className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${q.isActive
                    ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
                    : 'bg-slate-100 text-slate-500 hover:bg-green-100 hover:text-green-700'
                    }`}
                >
                  {q.isActive ? '✓ Active' : 'Inactive'}
                </button>
              </form>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
