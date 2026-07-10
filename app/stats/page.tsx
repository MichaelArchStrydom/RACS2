import { db } from '@/lib/db'
import { requireMember } from '@/lib/auth'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function statsPage() {

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8 text-slate-900">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800">STATS WILL BE HERE :)</h1>
          <Link href="/" className="text-xs font-semibold text-slate-500 hover:text-slate-700">← Back to Roster</Link>
        </div>

        <div className="bg-white rounded-xl border shadow-sm divide-y divide-slate-100">
        </div>
      </div>
    </main>
  )
}
