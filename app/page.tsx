import { db } from '../lib/db'
import RosterGrid from '@/components/roster/RosterGrid'
import Link from 'next/link'
import RequestsBoard from '@/components/roster/RequestsBoard'
import UserSelector from '@/components/roster/UserSelector'

interface PageProps {
  searchParams: Promise<{ date?: string; user?: string }>
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const targetDateStr = params.date;

  let anchorDate = new Date();
  if (targetDateStr) {
    const parsed = new Date(targetDateStr);
    if (!isNaN(parsed.getTime())) {
      anchorDate = parsed;
    }
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

  const userQuery = params.user ? `&user=${params.user}` : '';
  const prevLink = `/?date=${prevDate.toISOString().split('T')[0]}${userQuery}`;
  const nextLink = `/?date=${nextDate.toISOString().split('T')[0]}${userQuery}`;

  const activeSlots = await db.shiftSlot.findMany({
    where: {
      date: { gte: startDate, lte: endDate }
    },
    include: {
      requests: true,
      assignments: {
        include: {
          member: true,
          actualMember: true,
        },
        orderBy: { startTime: 'asc' },
      },
    },
    orderBy: { date: 'asc' },
  });

  const groupedData: Record<string, any[]> = {};
  activeSlots.forEach((slot) => {
    const slotDateObj = new Date(slot.date);
    const dateKey = `${slotDateObj.getFullYear()}-${String(slotDateObj.getMonth() + 1).padStart(2, '0')}-${String(slotDateObj.getDate()).padStart(2, '0')}`;

    if (!groupedData[dateKey]) {
      groupedData[dateKey] = [];
    }
    groupedData[dateKey].push(slot);
  });

  const standInRequests = await db.standInRequest.findMany({
    where: {
      slot: {
        date: { gte: startDate, lte: endDate }
      }
    },
    include: {
      slot: true,
      requestedBy: true,
      coveredBy: true,
    },
    orderBy: { startTime: 'asc' }
  });

  const allMembers = await db.member.findMany({
    orderBy: { lastName: 'asc' }
  });

  const activeUserId = params.user || allMembers[0]?.id || '';

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8 text-slate-900">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Navigation Toolbar Header */}
        <header className="bg-white p-4 rounded-xl shadow-sm border flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <UserSelector members={allMembers} activeUserId={activeUserId} />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-800">Station Roster Board</h1>
              <p className="text-xs text-slate-400 font-medium">Active Environment Container Node</p>
            </div>
          </div>

          {/* Date Navigation Controls */}
          <div className="flex items-center gap-2 self-start md:self-center">
            <Link
              href={prevLink}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border rounded-lg text-xs font-semibold text-slate-700 transition-colors"
            >
              ← 7 Days
            </Link>
            <span className="text-xs text-slate-400 font-mono font-medium px-2 hidden sm:inline">
              {startDate.toLocaleDateString("en-NZ", { day: 'numeric', month: 'short' })} - {endDate.toLocaleDateString("en-NZ", { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <Link
              href={nextLink}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border rounded-lg text-xs font-semibold text-slate-700 transition-colors"
            >
              7 Days →
            </Link>
          </div>
        </header>

        {/* Unified Roster Matrix Grid */}
        <section className="space-y-2">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Operational Roster</h2>
            <span className="text-xs text-slate-400 font-mono">
              Window: {startDate.toLocaleDateString("en-NZ", { day: 'numeric', month: 'short' })} - {endDate.toLocaleDateString("en-NZ", { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <RosterGrid groupedData={groupedData} visibleDates={visibleDates} activeUserId={activeUserId} />
        </section>

        {/* Interactive Stand In Request Board */}
        <RequestsBoard
          requests={standInRequests}
          activeUserId={activeUserId}
        />

      </div>
    </main>
  );
}
