import { db } from '@/lib/db'
import RosterGrid from '@/components/roster/RosterGrid'
import Link from 'next/link'
import RequestsBoard from '@/components/roster/RequestsBoard'
import { requireMember } from '@/lib/auth'
import { todayNZDateString, addDaysToDateString, nzMidnightUTC } from '@/lib/timezone'
import LiveRefresher from '@/components/LiveRefresher'
import { AnnouncementsProvider } from '@/components/announcements/AnnouncementsContext'
import AnnouncementsPreview from '@/components/announcements/AnnouncementsPreview'
import AnnouncementsPanel from '@/components/announcements/AnnouncementsPanel'
import { RosterInteractionProvider } from '@/components/roster/RosterInteractionContext'

interface PageProps {
  searchParams: Promise<{ date?: string }>
}

export default async function HomePage({ searchParams }: PageProps) {
  const currentMember = await requireMember()
  const activeUserId = currentMember.id
  const params = await searchParams;
  const targetDateStr = params.date;

  // Anchor on the NZ calendar date, not the server's own "today" — Vercel
  // runs in UTC, so new Date() there can already be a different calendar
  // day than it is in NZ.
  const isValidDateStr = targetDateStr && /^\d{4}-\d{2}-\d{2}$/.test(targetDateStr)
  const baseDateStr = isValidDateStr ? targetDateStr! : todayNZDateString();

  // All calendar-date math below is done on plain "YYYY-MM-DD" strings via
  // addDaysToDateString, which is pure UTC-anchored calendar arithmetic —
  // immune to server/browser timezone and DST. Only at the DB-query boundary
  // do we convert a date string to a real instant, via nzMidnightUTC.
  const visibleDateStrs = Array.from({ length: 7 }, (_, i) => addDaysToDateString(baseDateStr, i));
  const visibleDates: Date[] = visibleDateStrs.map(nzMidnightUTC);

  const startDate = nzMidnightUTC(visibleDateStrs[0]);
  const endDate = nzMidnightUTC(addDaysToDateString(visibleDateStrs[6], 1)); // exclusive upper bound

  const prevLink = `/?date=${addDaysToDateString(baseDateStr, -7)}`;
  const nextLink = `/?date=${addDaysToDateString(baseDateStr, 7)}`;

  //Simultaneous execusion optimised for vercels slow performance
  const [activeSlots, standInRequests, activeAppliances, allAnnouncements] = await Promise.all([
    db.shiftSlot.findMany({
      where: { date: { gte: startDate, lt: endDate } },
      include: {
        requests: true,
        assignments: {
          // Narrow member selects to display fields only — these rows go to
          // client components, so a full row would serialize the password
          // hash (and other private fields) into the page payload.
          include: {
            member: { select: { id: true, firstName: true, lastName: true } },
            actualMember: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { startTime: 'asc' },
        },
      },
      orderBy: { date: 'asc' },
    }),
    db.standInRequest.findMany({
      where: { slot: { date: { gte: startDate, lt: endDate } } },
      include: {
        slot: true,
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
        coveredBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { startTime: 'asc' }
    }),
    db.appliance.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      select: { name: true }
    }),
    db.announcement.findMany({
      where: { isActive: true },
      include: { receipts: { where: { memberId: activeUserId } } },
      orderBy: { createdAt: 'desc' },
    })
  ]);

  const groupedData: Record<string, any[]> = {};
  activeSlots.forEach((slot) => {
    // Group slots explicitly by the New Zealand calendar date
    const dateKey = new Date(slot.date).toLocaleDateString("en-CA", { timeZone: 'Pacific/Auckland' });
    if (!groupedData[dateKey]) groupedData[dateKey] = [];
    groupedData[dateKey].push(slot);
  });

  const appliancesArray = activeAppliances.map(a => a.name);

  // Build a dropdown list of shifts the active user can put up for cover:
  // either their own original assignment (not yet covered), or one they're
  // currently covering for someone else (a "chain" cover request).
  const userShifts = activeSlots.flatMap((slot) =>
    slot.assignments
      .filter((a: any) => (a.memberId === activeUserId && !a.actualMemberId) || a.actualMemberId === activeUserId)
      .map((a: any) => {
        const slotDateStr = new Date(slot.date).toLocaleDateString("en-NZ", { timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short' });
        const startStr = new Date(a.startTime).toLocaleTimeString("en-NZ", { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit', hour12: false });
        const endStr = new Date(a.endTime).toLocaleTimeString("en-NZ", { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit', hour12: false });
        const isCovering = a.actualMemberId === activeUserId
        const coveringNote = isCovering ? ` · covering for ${a.member.lastName}` : ''

        return {
          assignmentId: a.id,
          label: `${slotDateStr} · ${slot.appliance} · ${a.applianceRole} · ${startStr}–${endStr}${coveringNote}`,
          startIso: a.startTime.toISOString(),
          defaultStart: startStr,
          defaultEnd: endStr,
        };
      })
  );

  // An announcement is unread if this member has no receipt for it yet,
  // or has a receipt but hasn't set readAt on it.
  const unreadAnnouncementsCount = allAnnouncements.filter(
    (a) => a.receipts.length === 0 || a.receipts[0].readAt === null
  ).length;

  // ── Moderator extras ──────────────────────────────────────────────────
  // Admins get all moderator abilities; only mods/admins receive the member
  // picker list and the all-members shift pool — normal members' payload
  // and UI stay byte-identical to before this feature existed.
  const viewerIsMod = currentMember.isAdmin || currentMember.isModerator;

  const memberOptions = viewerIsMod
    ? await db.member.findMany({
        where: { isActive: true },
        orderBy: { lastName: 'asc' },
        select: { id: true, firstName: true, lastName: true },
      })
    : undefined;

  // Same shape/filter as userShifts, generalized to every member using the
  // already-fetched slots (no extra query): a member's own uncovered
  // assignment, or one they're currently covering — keyed by ownerId so the
  // on-behalf form can filter to the chosen member.
  // (Every assignment slice is requestable by exactly its current owner, so
  // no filter is needed — the per-member filter in userShifts is just the
  // special case "current owner === me".)
  const allShifts = viewerIsMod
    ? activeSlots.flatMap((slot) =>
        slot.assignments
          .map((a: any) => {
            const ownerId = a.actualMemberId ?? a.memberId;
            const slotDateStr = new Date(slot.date).toLocaleDateString("en-NZ", { timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short' });
            const startStr = new Date(a.startTime).toLocaleTimeString("en-NZ", { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit', hour12: false });
            const endStr = new Date(a.endTime).toLocaleTimeString("en-NZ", { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit', hour12: false });
            const coveringNote = a.actualMemberId ? ` · covering for ${a.member.lastName}` : '';

            return {
              ownerId,
              assignmentId: a.id,
              label: `${slotDateStr} · ${slot.appliance} · ${a.applianceRole} · ${startStr}–${endStr}${coveringNote}`,
              startIso: a.startTime.toISOString(),
              defaultStart: startStr,
              defaultEnd: endStr,
            };
          })
      )
    : undefined;

  return (
    <>
      <LiveRefresher />
      <AnnouncementsProvider>
        <AnnouncementsPreview unreadCount={unreadAnnouncementsCount} latest={allAnnouncements[0] ?? null} />

        <RosterInteractionProvider>
          <section className="space-y-2">
            <div className="flex justify-between items-center px-1">
              <Link
                href={prevLink}
                className="min-w-21.2 text-center px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border rounded-lg text-xs font-semibold text-slate-700 transition-colors flex items-center justify-center gap-1"
              >
                ← 7 Days
              </Link>

              <span className="text-xs text-slate-400 font-mono font-medium px-2 sm:inline">
                {visibleDates[0].toLocaleDateString("en-NZ", { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short' })} - {visibleDates[6].toLocaleDateString("en-NZ", { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', year: 'numeric' })}
              </span>

              <Link
                href={nextLink}
                className="min-w-21.2 text-center px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border rounded-lg text-xs font-semibold text-slate-700 transition-colors flex items-center justify-center gap-1"
              >
                7 Days →
              </Link>
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
            isModerator={viewerIsMod}
            memberOptions={memberOptions}
            allShifts={allShifts}
          />
        </RosterInteractionProvider>

        <AnnouncementsPanel announcements={allAnnouncements} activeUserId={activeUserId} />
      </AnnouncementsProvider>
    </>
  );
}
