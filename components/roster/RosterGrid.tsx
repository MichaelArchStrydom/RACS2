'use client'

import { Fragment } from 'react'
import RosterCell from './RosterCell'

interface RosterGridProps {
  groupedData: Record<string, any[]>;
  visibleDates: Date[];
  activeUserId: string;
  appliances: string[];
}

export default function RosterGrid({ groupedData, visibleDates, activeUserId, appliances }: RosterGridProps) {
  const roles = ["OIC", "Driver", "FF1", "FF2", "FF3"];

  // Derive the NZ calendar date key and weekday for each visible date ONCE,
  // using explicit timeZone formatting rather than local getters.
  //
  // FIX: date.getFullYear()/getMonth()/getDate()/getDay() read the date in
  // whichever timezone the JS engine happens to be running in — the Vercel
  // server (UTC) during SSR, then the user's own browser (NZ) after
  // hydration. Those two can disagree on the calendar day, which produced a
  // dateKey that didn't match groupedData's NZ-explicit keys from page.tsx,
  // showing "No Assignment" until the client re-render corrected it.
  const days = visibleDates.map((date) => {
    const dateKey = date.toLocaleDateString("en-CA", { timeZone: 'Pacific/Auckland' });
    const dayStr = date.toLocaleDateString("en-NZ", { timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short' });
    const [y, m, d] = dateKey.split('-').map(Number);
    const isWeekend = [0, 6].includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay());
    return { date, dateKey, dayStr, isWeekend };
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
      <table className="w-full min-w-327.5 table-fixed border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
            <th className="p-3 text-left w-14 border-r">Seat</th>
            {days.map(({ date, dateKey, dayStr, isWeekend }) => (
              <th key={dateKey} className={`p-2 text-center border-r font-medium ${isWeekend ? 'bg-slate-100/50' : ''}`}>
                {dayStr}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {appliances.map((appliance) => (
            <Fragment key={appliance}>
              {/* SECTION SUB-HEADER ROW */}
              <tr className="bg-slate-100/80 border-y border-slate-200">
                <td colSpan={8} className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600 align-middle">
                  {appliance}
                </td>
              </tr>

              {/* INDIVIDUAL ROLE ROWS */}
              {roles.map((role) => (
                <tr key={`${appliance}-${role}`} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-2 border-r font-medium text-slate-700 bg-slate-50/30 text-[11px]">
                    <div className="flex flex-col">
                      <span className="text-slate-700 font-semibold">{role}</span>
                      <span className="text-[9px] block h-3"></span>
                    </div>
                  </td>
                  {days.map(({ dateKey }) => {
                    const daySlots = groupedData[dateKey] || [];
                    const matchingSlot = daySlots.find(s => s.appliance === appliance);

                    // Collect all assignment timeline segments for this seat
                    const roleAssignments = matchingSlot?.assignments.filter((a: any) => a.applianceRole === role) || [];
                    const slotRequests = matchingSlot?.requests || [];

                    return (
                      <td key={dateKey} className="p-1 border-r align-top min-w-25">
                        {roleAssignments.length > 0 ? (
                          <RosterCell
                            assignments={roleAssignments}
                            slotRequests={slotRequests}
                            activeUserId={activeUserId}
                          />
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
      </table>
    </div>
  );
}
