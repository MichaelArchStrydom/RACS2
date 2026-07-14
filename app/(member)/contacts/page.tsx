import { db } from '@/lib/db'
import { requireMember } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function ContactsPage() {
  await requireMember()

  const members = await db.member.findMany({
    where: { isActive: true },
    orderBy: { lastName: 'asc' },
    select: { id: true, firstName: true, lastName: true, rank: true, email: true, phone: true },
  })

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white rounded-xl border shadow-sm divide-y divide-slate-100">
        {members.map((m) => (
          <div key={m.id} className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">{m.lastName}, {m.firstName}</p>
              <p className="text-xs text-slate-400 font-mono">{m.rank}</p>
            </div>
            <div className="text-right text-xs text-slate-500 space-y-0.5">
              {m.email ? <p>{m.email}</p> : <p className="italic text-slate-300">No email</p>}
              {m.phone ? <p>{m.phone}</p> : <p className="italic text-slate-300">No phone</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
