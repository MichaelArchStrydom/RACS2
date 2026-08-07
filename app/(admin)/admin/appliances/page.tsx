import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { addAppliance, updateAppliance } from '@/app/actions/adminActions'
import { requireAdmin } from '@/lib/auth'
import SeatManager from '@/components/appliances/seatManager'

// Force Next.js to skip static compilation and render this live on request
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ user?: string; success?: string; error?: string }>
}

export default async function AppliancesPage({ searchParams }: PageProps) {
  const admin = await requireAdmin()
  const activeUserId = admin.id

  const { user: userId, success, error } = await searchParams
  if (!userId) redirect('/')

  const adminMember = await db.member.findUnique({ where: { id: userId } })
  if (!adminMember?.isAdmin) redirect('/')

  const appliances = await db.appliance.findMany({ orderBy: { displayOrder: 'asc' } })

  const defaultSeats: { seats: string; seatsAbbr: string }[] = [
    { seats: "OIC", seatsAbbr: "OIC" },
    { seats: "Driver", seatsAbbr: "Dvr" },
    { seats: "FF1", seatsAbbr: "FF1" },
    { seats: "FF2", seatsAbbr: "FF2" },
    { seats: "FF3", seatsAbbr: "FF3" }
  ];

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
            try {
              const labels = fd.getAll('seatLabels') as string[]
              const abbrs = fd.getAll('seatAbbr') as string[]
              await addAppliance(fd.get('adminId') as string, {
                name: fd.get('name') as string,
                displayOrder: Number(fd.get('displayOrder')),
                seatCount: labels.length,
                minimumCrew: Number(fd.get('minimumCrew')),
                seats: labels.map((label, i) => ({ label, abbr: abbrs[i] })),
              })
              redirect(`/admin/appliances?user=${fd.get('adminId')}&success=${encodeURIComponent('Appliance added')}`)
            } catch (e: any) {
              if (e?.digest?.startsWith('NEXT_REDIRECT')) throw e
              redirect(`/admin/appliances?user=${fd.get('adminId')}&error=${encodeURIComponent(e.message ?? 'Unknown error')}`)
            }
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
            <label className="text-xs font-semibold text-slate-500">Minimum Crew</label>
            <input name="minimumCrew" type="number" defaultValue={3} className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          {/*Seat Manager*/}
          <div className="flex flex-col gap-1 col-span-2">
            <SeatManager initialSeats={defaultSeats} />
          </div>
          <div className="flex items-end">
            <button type="submit" className="w-full px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-lg">Submit Appliance</button>
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
                try {
                  const labels = fd.getAll('seatLabels') as string[]
                  const abbrs = fd.getAll('seatAbbr') as string[]
                  await updateAppliance(fd.get('adminId') as string, fd.get('applianceId') as string, {
                    name: fd.get('name') as string,
                    displayOrder: Number(fd.get('displayOrder')),
                    seatCount: labels.length,
                    minimumCrew: Number(fd.get('minimumCrew')),
                    isActive: fd.get('isActive') === 'on',
                    notes: fd.get('notes') as string || undefined,
                    seats: labels.map((label, i) => ({ label, abbr: abbrs[i] })),
                  })
                  redirect(`/admin/appliances?user=${fd.get('adminId')}&success=${encodeURIComponent('Appliance updated')}`)
                } catch (e: any) {
                  if (e?.digest?.startsWith('NEXT_REDIRECT')) throw e
                  redirect(`/admin/appliances?user=${fd.get('adminId')}&error=${encodeURIComponent(e.message ?? 'Unknown error')}`)
                }
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
                  <label className="text-xs font-semibold text-slate-500">Min Crew</label>
                  <input name="minimumCrew" type="number" defaultValue={a.minimumCrew} className="border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="py-5 flex flex-col gap-1 col-span-2 md:col-span-4">
                  <SeatManager
                    initialSeats={(a.seats as { label: string; abbr: string }[]).map((s) => ({
                      seats: s.label,
                      seatsAbbr: s.abbr,
                    }))}
                  />
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
