import { db } from '../lib/db'
import RosterGrid from '@/components/roster/RosterGrid'
import Link from 'next/link'
import RequestsBoard from '@/components/roster/RequestsBoard'
import { requireMember } from '@/lib/auth'
import { logoutAction } from './actions/authActions'
//NOTE:
//removed. may be useul later
//import UserSelector from '@/components/roster/UserSelector'
//import { Suspense } from 'react'

interface PageProps {
  searchParams: Promise<{ date?: string }>
}

export default async function HomePage({ searchParams }: PageProps) {
  const currentMember = await requireMember()
  const activeUserId = currentMember.id
  const params = await searchParams;
  const targetDateStr = params.date;

  let anchorDate = new Date();
  if (targetDateStr) {
    const parsed = new Date(targetDateStr);
    if (!isNaN(parsed.getTime())) anchorDate = parsed;
  }
  anchorDate.setHours(0, 0, 0, 0);

  const visibleDates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(anchorDate);
    d.setDate(anchorDate.getDate() + i);
    visibleDates.push(d);
  }

  const startDate = new Date(visibleDates[0]);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(visibleDates[6]);
  endDate.setHours(23, 59, 59, 999);

  const prevDate = new Date(anchorDate);
  prevDate.setDate(anchorDate.getDate() - 6);
  const nextDate = new Date(anchorDate);
  nextDate.setDate(anchorDate.getDate() + 8);

  const prevLink = `/?date=${prevDate.toISOString().split('T')[0]}`;
  const nextLink = `/?date=${nextDate.toISOString().split('T')[0]}`;

  //Simultaneous execusion optimised for vercels slow performance
  const [activeSlots, standInRequests, allMembers, activeAppliances] = await Promise.all([
    db.shiftSlot.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      include: {
        requests: true,
        assignments: {
          include: { member: true, actualMember: true },
          orderBy: { startTime: 'asc' },
        },
      },
      orderBy: { date: 'asc' },
    }),
    db.standInRequest.findMany({
      where: { slot: { date: { gte: startDate, lte: endDate } } },
      include: { slot: true, requestedBy: true, coveredBy: true },
      orderBy: { startTime: 'asc' }
    }),
    db.member.findMany({ orderBy: { lastName: 'asc' } }),
    db.appliance.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      select: { name: true }
    })
  ]);

  const groupedData: Record<string, any[]> = {};
  activeSlots.forEach((slot) => {
    const slotDateObj = new Date(slot.date);
    const dateKey = `${slotDateObj.getFullYear()}-${String(slotDateObj.getMonth() + 1).padStart(2, '0')}-${String(slotDateObj.getDate()).padStart(2, '0')}`;
    if (!groupedData[dateKey]) groupedData[dateKey] = [];
    groupedData[dateKey].push(slot);
  });

  const appliancesArray = activeAppliances.map(a => a.name);

  // Build a dropdown list of the active user's own shifts in this window.
  // Excludes already-covered segments (actualMemberId set) since those
  // don't need a cover request.
  const userShifts = activeSlots.flatMap((slot) =>
    slot.assignments
      .filter((a: any) => a.memberId === activeUserId && !a.actualMemberId)
      .map((a: any) => ({
        assignmentId: a.id,
        label: `${new Date(slot.date).toLocaleDateString("en-NZ", { weekday: 'short', day: 'numeric', month: 'short' })} · ${slot.appliance} · ${a.applianceRole} · ${new Date(a.startTime).toLocaleTimeString("en-NZ", { hour: '2-digit', minute: '2-digit', hour12: false })}–${new Date(a.endTime).toLocaleTimeString("en-NZ", { hour: '2-digit', minute: '2-digit', hour12: false })}`,
        startIso: a.startTime.toISOString(),
        defaultStart: new Date(a.startTime).toLocaleTimeString("en-NZ", { hour: '2-digit', minute: '2-digit', hour12: false }),
        defaultEnd: new Date(a.endTime).toLocaleTimeString("en-NZ", { hour: '2-digit', minute: '2-digit', hour12: false }),
      }))
  );

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8 text-slate-900">
      <div className="max-w-7xl mx-auto space-y-6">

        <header className="bg-white p-4 rounded-xl shadow-sm border flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">

            {/* Wrapped the dropdown inside Suspense to isolate useSearchParams NOTE: REMOVED ALONG WITH IMPORTS ABOVE. REPLACED WITH LOGOUT BUTTON
            <Suspense fallback={
              <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm w-48 h-8 animate-pulse" />
            }>
              <UserSelector members={allMembers} activeUserId={activeUserId} />
            </Suspense>
            */}
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Logged In As</span>
                <span className="text-xs font-bold text-slate-700">{currentMember.firstName} {currentMember.lastName}</span>
              </div>

              {/* Replace the <a> tag with this <form> using your existing logoutAction */}
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded transition-colors border border-transparent hover:border-rose-100 ml-2"
                >
                  Sign Out
                </button>
              </form>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-800">Station Roster Board</h1>
              <p className="text-xs text-slate-400 font-medium">Active Environment Container Node</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start md:self-center">
            {/* ADMIN PORTAL BRIDGE LINK */}
            {allMembers.find(m => m.id === activeUserId)?.isAdmin && (
              <Link
                href={`/admin?user=${activeUserId}`}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors mr-2 flex items-center gap-1"
              >
                Admin Portal
              </Link>
            )}
            <Link
              href={prevLink}
              className="min-w-21.2 text-center px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border rounded-lg text-xs font-semibold text-slate-700 transition-colors flex items-center justify-center gap-1"
            >
              ← 7 Days
            </Link>

            <span className="text-xs text-slate-400 font-mono font-medium px-2 hidden sm:inline">
              {startDate.toLocaleDateString("en-NZ", { day: 'numeric', month: 'short' })} - {endDate.toLocaleDateString("en-NZ", { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>

            <Link
              href={nextLink}
              className="min-w-21.2 text-center px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border rounded-lg text-xs font-semibold text-slate-700 transition-colors flex items-center justify-center gap-1"
            >
              7 Days →
            </Link>
          </div>
        </header>

        <section className="space-y-2">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Operational Roster</h2>
            <span className="text-xs text-slate-400 font-mono">
              Window: {startDate.toLocaleDateString("en-NZ", { day: 'numeric', month: 'short' })} - {endDate.toLocaleDateString("en-NZ", { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <RosterGrid
            groupedData={groupedData}
            visibleDates={visibleDates}
            activeUserId={activeUserId}
            appliances={appliancesArray}
          />
        </section>

        <RequestsBoard
          requests={standInRequests}
          activeUserId={activeUserId}
          userShifts={userShifts}
        />

      </div>
    </main>
  );
}
