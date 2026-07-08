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

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
      <table className="w-full min-w-327.5 table-fixed border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
            <th className="p-3 text-left w-15 border-r">Seat</th>
            {visibleDates.map((date) => {
              // Timezone fix applied here
              const dayStr = date.toLocaleDateString("en-NZ", { timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short' });
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              return (
                <th key={date.toISOString()} className={`p-2 text-center border-r font-medium ${isWeekend ? 'bg-slate-100/50' : ''}`}>
                  {dayStr}
                </th>
              );
            })}
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
                  {visibleDates.map((date) => {
                    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                    const daySlots = groupedData[dateKey] || [];
                    const matchingSlot = daySlots.find(s => s.appliance === appliance);

                    // Collect all assignment timeline segments for this seat
                    const roleAssignments = matchingSlot?.assignments.filter((a: any) => a.applianceRole === role) || [];
                    const slotRequests = matchingSlot?.requests || [];

                    return (
                      <td key={dateKey} className="p-1 border-r align-top min-w-35">
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
