'use client'

import { Fragment, useEffect } from 'react'
import { formatInTimeZone } from 'date-fns-tz'
import RosterCell from './RosterCell'
import EditableRosterCell from './EditableRosterCell'
import { useRosterInteraction, cellKeyStr, type DraftAssignment } from './RosterInteractionContext'
import { getShiftTimesForDate, type ApplianceShiftHours } from '@/lib/shiftHours'
import { NZ_TZ } from '@/lib/timezone'

interface ApplianceForGrid extends ApplianceShiftHours {
  name: string
  seats: { label: string; abbr: string }[]
  allowSelfClaim: boolean
}

interface RosterGridProps {
  groupedData: Record<string, any[]>;
  visibleDates: Date[];
  activeUserId: string;
  appliances: ApplianceForGrid[];
  isModerator?: boolean;
}

export default function RosterGrid({ groupedData, visibleDates, activeUserId, appliances, isModerator = false }: RosterGridProps) {
  const { claimSeat, openEditPanel, isEditMode, editDraft, dirtyKeys, initEditDraft } = useRosterInteraction()

  // TODO: Make roles a dynamic object array instead of hardcoded for variations in appliances.
  // Admins can already change seat count on appliances but renders on main roster as the standard 5 no matter what.

  const days = visibleDates.map((date) => {
    const dateKey = formatInTimeZone(date, NZ_TZ, 'yyyy-MM-dd');
    const dayStr = formatInTimeZone(date, NZ_TZ, 'EEE, d MMM');
    const [y, m, d] = dateKey.split('-').map(Number);
    const isWeekend = [0, 6].includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay());
    return { date, dateKey, dayStr, isWeekend };
  });

  const visibleDaysCount = visibleDates.length + 1

  const editModeActive = isEditMode && isModerator

  useEffect(() => {
    if (!editModeActive || editDraft !== null) return
    const initial: Record<string, DraftAssignment[]> = {}
    for (const { dateKey } of days) {
      const daySlots = groupedData[dateKey] || []
      for (const appliance of appliances) {
        const matchingSlot = daySlots.find((s) => s.appliance === appliance.name)
        for (const seat of appliance.seats as { label: string; abbr: string }[]) {
          const key = cellKeyStr({ dateStr: dateKey, applianceName: appliance.name, applianceRole: seat.label })
          const roleAssignments = matchingSlot?.assignments.filter((a: any) => a.applianceRole === seat.label) || []
          initial[key] = roleAssignments.map((a: any) => ({
            id: a.id,
            memberId: a.memberId,
            member: a.member ?? null,
            actualMemberId: a.actualMemberId ?? null,
            actualMember: a.actualMember ?? null,
            startTime: new Date(a.startTime),
            endTime: new Date(a.endTime),
          }))
        }
      }
    }
    initEditDraft(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editModeActive, editDraft])
  //TODO: fixed the ugly desktop space on roster table :)
  return (
    <div className={`rounded-xl shadow-sm border overflow-x-auto transition-colors ${editModeActive ? 'bg-rose-50/40 border-rose-200' : 'bg-white'}`}>
      <table className="border-collapse w-full">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
            <th className="p-3 text-left border-r whitespace-nowrap"></th>
            {days.map(({ date, dateKey, dayStr, isWeekend }) => (
              <th key={dateKey} className={`p-2 text-center border-r font-medium whitespace-nowrap ${isWeekend ? 'bg-slate-100/50' : ''}`}>
                {dayStr}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {appliances.map(appliance => (
            <Fragment key={appliance.name}>
              {/* SECTION SUB-HEADER ROW */}
              <tr className="bg-slate-100/80 border-y border-slate-200">
                <td colSpan={visibleDaysCount} className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600 align-middle">
                  {appliance.name}
                </td>
              </tr>

              {/* INDIVIDUAL ROLE ROWS */}
              {(appliance.seats as { label: string; abbr: string }[]).map(
                (seat) => (
                  <tr key={`${appliance.name}-${seat.abbr}`} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-2 border-r font-medium text-slate-700 bg-slate-50/30 text-[11px]">
                      <div className="flex flex-col">
                        <span className="text-slate-700 font-semibold">{seat.abbr}</span>
                        <span className="text-[9px] block "></span>
                      </div>
                    </td>
                    {days.map(({ dateKey, dayStr, isWeekend }) => {
                      const daySlots = groupedData[dateKey] || [];
                      const matchingSlot = daySlots.find(s => s.appliance === appliance.name);
                      const cellKey = cellKeyStr({ dateStr: dateKey, applianceName: appliance.name, applianceRole: seat.label })

                      const roleAssignments = editModeActive && editDraft
                        ? (editDraft[cellKey] ?? [])
                        : (matchingSlot?.assignments.filter((a: any) => a.applianceRole === seat.label) || []);
                      const slotRequests = matchingSlot?.requests || [];
                      const isDirty = editModeActive && dirtyKeys.has(cellKey)

                      const isClaimable = appliance.allowSelfClaim;

                      const { shiftStart, shiftEnd } = getShiftTimesForDate(dateKey, isWeekend, appliance)

                      const cellProps = {
                        assignments: roleAssignments,
                        slotRequests,
                        activeUserId,
                        shiftBounds: { start: shiftStart, end: shiftEnd },
                        dateStr: dateKey,
                        applianceName: appliance.name,
                        applianceRole: seat.label,
                        cellLabel: `${dayStr} · ${appliance.name} · ${seat.label}`,
                      }

                      return (
                        <td
                          key={dateKey}
                          className={`p-1 border-r align-top transition-colors ${isDirty ? 'bg-yellow-100' : ''}`}
                          data-date-key={dateKey}
                          data-appliance={appliance.name}
                          data-role={seat.label}
                          data-shift-start={shiftStart.toISOString()}
                          data-shift-end={shiftEnd.toISOString()}
                        >
                          {editModeActive ? (
                            <EditableRosterCell {...cellProps} />
                          ) : roleAssignments.length > 0 ? (
                            <RosterCell {...cellProps} />
                          ) : isClaimable ? (
                            <div
                              onClick={() => claimSeat({
                                dateStr: dateKey,
                                applianceName: appliance.name,
                                applianceRole: seat.label,
                                label: cellProps.cellLabel,
                              })}
                              className="text-center py-2 text-rose-400 italic text-[10px] cursor-pointer hover:text-rose-600 hover:underline"
                            >
                              Tap to claim
                            </div>
                          ) : (
                            <div className="text-center py-2 text-slate-300 italic text-[10px]">No Assignment</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-100/80 border-y border-slate-200">
            <td colSpan={visibleDaysCount} className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600 align-middle">
            </td>
          </tr>
          <tr className="bg-slate-50 border-slate-200 text-[11px] font-semibold text-slate-500">
            <th className="p-3 text-left border-r whitespace-nowrap"></th>
            {days.map(({ dateKey, dayStr, isWeekend }) => (
              <th key={dateKey} className={`text-center border-r font-medium whitespace-nowrap ${isWeekend ? 'bg-slate-100/50' : ''}`}>
                {dayStr}
              </th>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
