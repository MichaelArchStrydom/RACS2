export const dynamic = 'force-dynamic'

import { db } from '@/lib/db'
import { requireMember } from '@/lib/auth'
import { fetchMusterData, type MemberMusterRow } from '@/lib/dashboardLiveOsm'
import { formatDistanceToNow } from 'date-fns'

type OsmStatusColor = 'red' | 'yellow' | 'green'
interface CachedOsmStatus {
  color: OsmStatusColor
  overdueCount: number
  dueSoonCount: number
  checkedAt: Date | null
}

const skillDotColors: Record<OsmStatusColor, string> = {
  red: 'bg-rose-500',
  yellow: 'bg-amber-400',
  green: 'bg-emerald-500',
}

function StatCell({ value, suffix = '', flagged = false }: { value: number; suffix?: string; flagged?: boolean }) {
  return (
    <td className={`px-2 py-2 text-center text-xs font-mono ${flagged ? 'bg-rose-50 text-rose-700 font-bold' : 'text-slate-600'}`}>
      {value}{suffix}
    </td>
  )
}

function MemberRow({ row, status }: { row: MemberMusterRow; status: CachedOsmStatus | null }) {
  return (
    <tr className={`border-b border-slate-100 hover:bg-slate-50/50 ${row.onLeave ? 'bg-blue-50' : ''}`}>
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="flex items-center gap-2">
          {status && (
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${skillDotColors[status.color]}`}
              title={
                `Skills: ${status.color}` +
                (status.overdueCount > 0 ? ` — ${status.overdueCount} overdue` : '') +
                (status.dueSoonCount > 0 ? ` — ${status.dueSoonCount} due soon` : '') +
                (status.checkedAt ? ` (checked ${formatDistanceToNow(status.checkedAt, { addSuffix: true })})` : '')
              }
            />
          )}
          {row.osmProfileUrl ? (
            <a
              href={row.osmProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-slate-800 hover:text-rose-600 hover:underline"
            >
              {row.name}
            </a>
          ) : (
            <span className="text-sm font-semibold text-slate-800">{row.name}</span>
          )}
          {row.onLeave && (
            <span className="text-[9px] font-bold uppercase tracking-wide text-blue-600 bg-blue-100 rounded-full px-1.5 py-0.5">
              Leave
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-400 font-mono">{row.rank}</span>
      </td>
      <StatCell value={row.mustersAttended} flagged={row.mustersFlagged} />
      <StatCell value={row.brigadeMusters} flagged={row.mustersFlagged} />
      <StatCell value={row.mustersPercent} suffix="%" flagged={row.mustersFlagged} />
      <StatCell value={row.oic} flagged={row.incidentsFlagged} />
      <StatCell value={row.driver} flagged={row.incidentsFlagged} />
      <StatCell value={row.crew} flagged={row.incidentsFlagged} />
      <StatCell value={row.ownTransport} flagged={row.incidentsFlagged} />
      <StatCell value={row.incidentsTotal} flagged={row.incidentsFlagged} />
      <StatCell value={row.appliancePercent} suffix="%" flagged={row.incidentsFlagged} />
      <StatCell value={row.atStation} flagged={row.incidentsFlagged} />
      <StatCell value={row.attendancePercent} suffix="%" flagged={row.incidentsFlagged} />
      <StatCell value={row.leaveDays} />
      <StatCell value={row.absentDays} />
      <StatCell value={row.grandTotal} />
    </tr>
  )
}

export default async function OsmPage() {
  await requireMember()

  const [musterResult, linkedMembers] = await Promise.allSettled([
    fetchMusterData(),
    db.member.findMany({
      where: { osmId: { not: null } },
      select: { osmId: true, osmStatusColor: true, osmOverdueCount: true, osmDueSoonCount: true, osmStatusCheckedAt: true },
    }),
  ])

  let data: Awaited<ReturnType<typeof fetchMusterData>> | null = null
  let error: string | null = null
  if (musterResult.status === 'fulfilled') {
    data = musterResult.value
  } else {
    const e: any = musterResult.reason
    const cause = e?.cause?.message ?? e?.cause?.code
    error = (e?.message ?? 'Failed to load OSM data.') + (cause ? ` (${cause})` : '')
    console.error('OSM page: fetchMusterData failed:', e, 'cause:', e?.cause)
  }

  // Cached, not live — refreshed periodically by ops/osm-status-refresher on
  // the Pi. Members not yet linked, or not yet refreshed, just show no dot.
  const statusByOsmId = new Map<string, CachedOsmStatus>()
  if (linkedMembers.status === 'fulfilled') {
    for (const m of linkedMembers.value) {
      if (!m.osmId || !m.osmStatusColor) continue
      statusByOsmId.set(m.osmId, {
        color: m.osmStatusColor as OsmStatusColor,
        overdueCount: m.osmOverdueCount ?? 0,
        dueSoonCount: m.osmDueSoonCount ?? 0,
        checkedAt: m.osmStatusCheckedAt,
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-500">
          Live mirror of OSM muster and incident attendance from{' '}
          <a href="https://www.dashboardlive.nz/musters.php?bu=%7B1B421B9F-6A82-4C06-8828-EEE7A2EC7694%7D" target="_blank" rel="noopener noreferrer" className="underline hover:text-rose-600">
            DashboardLive
          </a>
        </p>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium px-4 py-3 rounded-lg">
          Couldn't load DashboardLive right now: {error}
        </div>
      )}

      {data && (
        <>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            {data.asOfLabel && <span>As of {data.asOfLabel}</span>}
            <span>{data.rows.length} members</span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400" /> under threshold
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400" /> on leave
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 -ml-1" />
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 -ml-1" />
              skill status (cached, hover a dot for detail)
            </span>
          </div>

          <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left whitespace-nowrap" rowSpan={2}>Member</th>
                  <th className="px-2 py-1 text-center" colSpan={3}>Musters</th>
                  <th className="px-2 py-1 text-center" colSpan={7}>Incidents</th>
                  <th className="px-2 py-1 text-center" colSpan={3}>Leave / Total</th>
                </tr>
                <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-semibold text-slate-400 uppercase tracking-wide">
                  <th className="px-2 py-1 text-center">Attended</th>
                  <th className="px-2 py-1 text-center">Brigade</th>
                  <th className="px-2 py-1 text-center">%</th>
                  <th className="px-2 py-1 text-center">OIC</th>
                  <th className="px-2 py-1 text-center">Driver</th>
                  <th className="px-2 py-1 text-center">Crew</th>
                  <th className="px-2 py-1 text-center">Own Trans</th>
                  <th className="px-2 py-1 text-center">Total</th>
                  <th className="px-2 py-1 text-center">Appl %</th>
                  <th className="px-2 py-1 text-center">Station</th>
                  <th className="px-2 py-1 text-center">Attend %</th>
                  <th className="px-2 py-1 text-center">Leave</th>
                  <th className="px-2 py-1 text-center">Absent</th>
                  <th className="px-2 py-1 text-center">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <MemberRow
                    key={row.osmId ?? row.name}
                    row={row}
                    status={row.osmId ? statusByOsmId.get(row.osmId) ?? null : null}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
