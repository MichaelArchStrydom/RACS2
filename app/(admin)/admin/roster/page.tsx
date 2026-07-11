import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { generateRoster, clearRosterRange } from '@/app/actions/adminActions'
import ClearRosterButton from '@/components/roster/ClearRosterButton'
import RosterCalendarEditor from '@/components/roster/RosterCalendarEditor'
import type { MonthSlotsByDate, CalendarSlot } from '@/components/roster/RosterCalendarTypes'
import { requireAdmin } from '@/lib/auth'
import {
  todayNZDateString, nzMidnightUTC, addDaysToDateString,
  getMonthGridDateStrings, addMonthsToMonthString,
} from '@/lib/timezone'

interface PageProps {
  searchParams: Promise<{ user?: string; success?: string; error?: string; month?: string }>
}

export default async function RosterToolsPage({ searchParams }: PageProps) {
  const admin = await requireAdmin()
  const activeUserId = admin.id
  const { user: userId, success, error, month: monthParam } = await searchParams
  if (!userId) redirect('/')

  const adminMember = await db.member.findUnique({ where: { id: userId } })
  if (!adminMember?.isAdmin) redirect('/')

  // Summary: how many days of slots exist from today onward (NZ calendar day,
  // independent of the server's own timezone)
  const todayStr = todayNZDateString()
  const today = nzMidnightUTC(todayStr)

  // ─── Visual calendar data ───────────────────────────────────────────────
  const isValidMonth = monthParam && /^\d{4}-\d{2}$/.test(monthParam)
  const monthStr = isValidMonth ? monthParam! : todayStr.slice(0, 7)

  const gridDates = getMonthGridDateStrings(monthStr)
  const gridStart = nzMidnightUTC(gridDates[0])
  const gridEnd = nzMidnightUTC(addDaysToDateString(gridDates[gridDates.length - 1], 1))

  const [calendarSlots, calendarCrews, calendarAppliances] = await Promise.all([
    db.shiftSlot.findMany({
      where: { date: { gte: gridStart, lt: gridEnd } },
      include: { assignments: { include: { member: true } } },
      orderBy: [{ date: 'asc' }, { appliance: 'asc' }],
    }),
    db.crew.findMany({ where: { isActive: true }, orderBy: { crewOrder: 'asc' }, select: { id: true, watchName: true } }),
    db.appliance.findMany({ where: { isActive: true }, orderBy: { displayOrder: 'asc' }, select: { name: true } }),
  ])

  const slotsByDate: MonthSlotsByDate = {}
  for (const slot of calendarSlots) {
    const dateKey = new Date(slot.date).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
    const watchNames = new Set(slot.assignments.map(a => a.historicalWatchName ?? null))
    const watchName = slot.assignments.length === 0 ? null : (watchNames.size === 1 ? [...watchNames][0] : null)

    const entry: CalendarSlot = {
      id: slot.id,
      appliance: slot.appliance,
      status: slot.status,
      watchName,
      assignments: slot.assignments.map(a => ({
        applianceRole: a.applianceRole,
        memberName: `${a.member.lastName}, ${a.member.firstName.charAt(0)}.`,
      })),
    }

    if (!slotsByDate[dateKey]) slotsByDate[dateKey] = []
    slotsByDate[dateKey].push(entry)
  }

  const prevMonthHref = `/admin/roster?user=${userId}&month=${addMonthsToMonthString(monthStr, -1)}`
  const nextMonthHref = `/admin/roster?user=${userId}&month=${addMonthsToMonthString(monthStr, 1)}`
  const monthLabel = new Date(`${monthStr}-01T00:00:00Z`).toLocaleDateString('en-NZ', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })

  const [futureSlotCount, lastSlotDate, totalAssignments, pendingRequests, openLeave] = await Promise.all([
    db.shiftSlot.count({ where: { date: { gte: today }, status: 'LIVE' } }),
    db.shiftSlot.findFirst({
      where: { status: 'LIVE' },
      orderBy: { date: 'desc' },
      select: { date: true },
    }),
    db.shiftAssignment.count(),
    db.standInRequest.count({ where: { status: 'PENDING' } }),
    db.memberLeave.count({ where: { status: 'PENDING' } }),
  ])

  const lastDate = lastSlotDate?.date
    ? new Date(lastSlotDate.date).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : 'No slots generated'

  // Default start = today, default end = today + 13 (14 days)
  const defaultStart = todayStr
  const defaultEnd = addDaysToDateString(todayStr, 13)

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Roster Tools</h1>
        <p className="text-sm text-slate-500 mt-1">Generate, clear, and inspect roster slots.</p>
      </div>

      {/* Feedback banners */}
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

      {/* Status summary */}
      <section className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Current State</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Future Slots', value: futureSlotCount, sub: 'from today', color: 'text-blue-600' },
            { label: 'Total Assignments', value: totalAssignments, sub: 'all time', color: 'text-slate-700' },
            { label: 'Pending Requests', value: pendingRequests, sub: 'need cover', color: pendingRequests > 0 ? 'text-amber-600' : 'text-slate-400' },
            { label: 'Pending Leave', value: openLeave, sub: 'awaiting approval', color: openLeave > 0 ? 'text-rose-600' : 'text-slate-400' },
          ].map(s => (
            <div key={s.label} className="bg-slate-50 rounded-lg p-3 border">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-400">{s.sub}</p>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Roster extends to: <span className="font-mono font-semibold text-slate-600">{lastDate}</span>
        </p>
      </section>

      {/* Visual month calendar */}
      <RosterCalendarEditor
        monthStr={monthStr}
        prevMonthHref={prevMonthHref}
        nextMonthHref={nextMonthHref}
        monthLabel={monthLabel}
        slotsByDate={slotsByDate}
        crews={calendarCrews}
        appliances={calendarAppliances}
        adminId={userId}
        todayStr={todayStr}
      />

      {/* Generate roster */}
      <section className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Generate Roster</h2>
          <p className="text-xs text-slate-400 mt-1">
            Creates shift slots and assignments using the crew rotation engine.
            Safe to run over existing dates — the engine will create duplicate slots if those dates already have slots.
            Clear the range first if you want a clean regeneration.
          </p>
        </div>
        <form
          action={async (fd: FormData) => {
            'use server'
            try {
              const start = fd.get('startDate') as string
              const days = Number(fd.get('days'))
              if (!start || isNaN(days) || days < 1 || days > 365) {
                throw new Error('Invalid date or day count (1–365)')
              }
              await generateRoster(fd.get('adminId') as string, start, days)
              redirect(`/admin/roster?user=${fd.get('adminId')}&success=${encodeURIComponent(`Generated ${days} days from ${start}`)}`)
            } catch (e: any) {
              if (e?.digest?.startsWith('NEXT_REDIRECT')) throw e
              redirect(`/admin/roster?user=${fd.get('adminId')}&error=${encodeURIComponent(e.message ?? 'Unknown error')}`)
            }
          }}
          className="grid grid-cols-2 md:grid-cols-3 gap-3"
        >
          <input type="hidden" name="adminId" value={userId} />

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">Start Date</label>
            <input name="startDate" type="date" defaultValue={defaultStart} required className="border rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">Number of Days</label>
            <input name="days" type="number" min="1" max="365" defaultValue={14} required className="border rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="flex items-end">
            <button type="submit" className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-lg transition-colors">
              ⚙️ Generate
            </button>
          </div>
        </form>
      </section>

      {/* Clear roster range */}
      <section className="bg-white rounded-xl border border-rose-100 shadow-sm p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-rose-700">⚠️ Clear Roster Range</h2>
          <p className="text-xs text-slate-400 mt-1">
            Permanently deletes all shift slots, assignments, and stand-in requests within the date range.
            This cannot be undone. Use before regenerating if you want fresh slots.
          </p>
        </div>

        {/* Rendered safely via our dedicated interactive button client wrapper */}
        <ClearRosterButton
          defaultStart={defaultStart}
          defaultEnd={defaultEnd}
          userId={userId}
          clearRosterAction={async (fd: FormData) => {
            'use server'
            try {
              const start = fd.get('clearStart') as string
              const end = fd.get('clearEnd') as string
              if (!start || !end) throw new Error('Both dates are required')
              if (new Date(end) < new Date(start)) throw new Error('End date must be after start date')
              await clearRosterRange(fd.get('adminId') as string, start, end)
              redirect(`/admin/roster?user=${fd.get('adminId')}&success=${encodeURIComponent(`Cleared roster from ${start} to ${end}`)}`)
            } catch (e: any) {
              if (e?.digest?.startsWith('NEXT_REDIRECT')) throw e
              redirect(`/admin/roster?user=${fd.get('adminId')}&error=${encodeURIComponent(e.message ?? 'Unknown error')}`)
            }
          }}
        />
      </section>

      {/* Quick regeneration: clear + generate in one step */}
      <section className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Quick Regenerate</h2>
          <p className="text-xs text-slate-400 mt-1">
            Clears and regenerates a date range in one step.
            All existing data (including cover requests) in the range will be lost.
          </p>
        </div>
        <form
          action={async (fd: FormData) => {
            'use server'
            try {
              const start = fd.get('regenStart') as string
              const days = Number(fd.get('regenDays'))
              if (!start || isNaN(days) || days < 1 || days > 365) throw new Error('Invalid input')

              const { addDaysToDateString } = await import('@/lib/timezone')
              const end = addDaysToDateString(start, days - 1)

              const adminId = fd.get('adminId') as string
              await clearRosterRange(adminId, start, end)
              await generateRoster(adminId, start, days)
              redirect(`/admin/roster?user=${adminId}&success=${encodeURIComponent(`Regenerated ${days} days from ${start}`)}`)
            } catch (e: any) {
              if (e?.digest?.startsWith('NEXT_REDIRECT')) throw e
              redirect(`/admin/roster?user=${fd.get('adminId')}&error=${encodeURIComponent(e.message ?? 'Unknown error')}`)
            }
          }}
          className="grid grid-cols-2 md:grid-cols-3 gap-3"
        >
          <input type="hidden" name="adminId" value={userId} />

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">Start Date</label>
            <input name="regenStart" type="date" defaultValue={defaultStart} required className="border rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">Number of Days</label>
            <input name="regenDays" type="number" min="1" max="365" defaultValue={14} required className="border rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="flex items-end">
            <button type="submit" className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors">
              ↺ Clear + Regenerate
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
