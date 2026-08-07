'use client'

import { Fragment } from 'react'
import RosterCell from './RosterCell'

interface RosterGridProps {
  groupedData: Record<string, any[]>;
  visibleDates: Date[];
  activeUserId: string;
  appliances: { name: string; seats: { label: string; abbr: string }[] }[];
}

export default function RosterGrid({ groupedData, visibleDates, activeUserId, appliances }: RosterGridProps) {

  // TODO: Make roles a dynamic object array instead of hardcoded for variations in appliances.
  // Admins can already change seat count on appliances but renders on main roster as the standard 5 no matter what. 

  const roles: { role: string; label: string }[] = [
    { role: "OIC", label: "OIC" },
    { role: "Driver", label: "Dvr" },
    { role: "FF1", label: "FF1" },
    { role: "FF2", label: "FF2" },
    { role: "FF3", label: "FF3" }
  ];

  const applianceNames = appliances.map(a => a.name)
  const applianceSeatAbbr: { name: string; seats: { abbr: string }[] }[] = appliances as { name: string; seats: { abbr: string }[] }[]


  const days = visibleDates.map((date) => {
    const dateKey = date.toLocaleDateString("en-CA", { timeZone: 'Pacific/Auckland' });
    const dayStr = date.toLocaleDateString("en-NZ", { timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short' });
    const [y, m, d] = dateKey.split('-').map(Number);
    const isWeekend = [0, 6].includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay());
    return { date, dateKey, dayStr, isWeekend };
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
      <table className="border-collapse">
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
                <td colSpan={8} className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600 align-middle">
                  {appliance.name}
                </td>
              </tr>

              {/* INDIVIDUAL ROLE ROWS */}
              {(appliance.seats as { label: string; abbr: string }[]).map(
                (seat) => (
                  <tr key={`${appliance}-${seat.abbr}`} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-2 border-r font-medium text-slate-700 bg-slate-50/30 text-[11px]">
                      <div className="flex flex-col">
                        <span className="text-slate-700 font-semibold">{seat.abbr}</span>
                        <span className="text-[9px] block h-3"></span>
                      </div>
                    </td>
                    {days.map(({ dateKey }) => {
                      const daySlots = groupedData[dateKey] || [];
                      const matchingSlot = daySlots.find(s => s.appliance === appliance.name);

                      // Collect all assignment timeline segments for this seat
                      const roleAssignments = matchingSlot?.assignments.filter((a: any) => a.applianceRole === seat.label) || [];
                      const slotRequests = matchingSlot?.requests || [];

                      return (
                        <td key={dateKey} className="p-1 border-r align-top ">
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
