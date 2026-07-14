import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { addAppliance, updateAppliance } from '@/app/actions/adminActions'
import { requireAdmin } from '@/lib/auth'

// Force Next.js to skip static compilation and render this live on request
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ user?: string }>
}

export default async function AppliancesPage({ searchParams }: PageProps) {
  const admin = await requireAdmin()
  const activeUserId = admin.id

  const { user: userId } = await searchParams
  if (!userId) redirect('/')

  const adminMember = await db.member.findUnique({ where: { id: userId } })
  if (!adminMember?.isAdmin) redirect('/')

  const appliances = await db.appliance.findMany({ orderBy: { displayOrder: 'asc' } })

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <p className="text-sm text-slate-500">
        Appliance names must exactly match the strings used in the roster engine ("1st Due", "2nd Due").
        Changing a name here does not automatically update existing roster slots — do a roster regeneration afterward.
      </p>

      {/* Add appliance */}
      <details className="bg-white border rounded-xl shadow-sm">
        <summary className="px-5 py-4 cursor-pointer text-sm font-semibold text-slate-700 hover:text-rose-600">+ Add Appliance</summary>
        <form
          action={async (fd: FormData) => {
            'use server'
            await addAppliance(fd.get('adminId') as string, {
              name: fd.get('name') as string,
              displayOrder: Number(fd.get('displayOrder')),
              seatCount: Number(fd.get('seatCount')),
              minimumCrew: Number(fd.get('minimumCrew')),
            })
          }}
          className="px-5 pb-5 grid grid-cols-2 gap-3"
        >
          <input type="hidden" name="adminId" value={userId} />
          <div className="flex flex-col gap-1 col-span-2">
            <label className="text-xs font-semibold text-slate-500">Name (must match roster engine string exactly)</label>
            <input name="name" required placeholder="e.g. 3rd Due" className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">Display Order</label>
            <input name="displayOrder" type="number" defaultValue={appliances.length + 1} className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">Seat Count</label>
            <input name="seatCount" type="number" defaultValue={5} className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">Minimum Crew</label>
            <input name="minimumCrew" type="number" defaultValue={3} className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex items-end">
            <button type="submit" className="w-full px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-lg">Add</button>
          </div>
        </form>
      </details>

      {/* Appliance cards */}
      <div className="space-y-4">
        {appliances.map((a: any) => (
          <section key={a.id} className={`bg-white rounded-xl border shadow-sm p-5 ${!a.isActive ? 'opacity-60' : ''}`}>
            <form
              action={async (fd: FormData) => {
                'use server'
                await updateAppliance(fd.get('adminId') as string, fd.get('applianceId') as string, {
                  name: fd.get('name') as string,
                  displayOrder: Number(fd.get('displayOrder')),
                  seatCount: Number(fd.get('seatCount')),
                  minimumCrew: Number(fd.get('minimumCrew')),
                  isActive: fd.get('isActive') === 'on',
                  notes: fd.get('notes') as string || undefined,
                })
              }}
              className="space-y-3"
            >
              <input type="hidden" name="adminId" value={userId} />
              <input type="hidden" name="applianceId" value={a.id} />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="flex flex-col gap-1 col-span-2">
                  <label className="text-xs font-semibold text-slate-500">Name</label>
                  <input name="name" defaultValue={a.name} className="border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500">Order</label>
                  <input name="displayOrder" type="number" defaultValue={a.displayOrder} className="border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500">Seats</label>
                  <input name="seatCount" type="number" defaultValue={a.seatCount} className="border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500">Min Crew</label>
                  <input name="minimumCrew" type="number" defaultValue={a.minimumCrew} className="border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <label className="text-xs font-semibold text-slate-500">Notes</label>
                  <input name="notes" defaultValue={a.notes ?? ''} placeholder="Optional notes" className="border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" name="isActive" defaultChecked={a.isActive} className="rounded" />
                  Active (visible in roster)
                </label>
                <button type="submit" className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg">Save</button>
              </div>
            </form>
          </section>
        ))}
      </div>
    </div>
  )
}
