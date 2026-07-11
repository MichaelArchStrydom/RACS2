'use client'

import type { CalendarSlot } from './RosterCalendarTypes'

interface RosterCalendarDayCellProps {
  dayNumber: number
  isOutsideMonth: boolean
  isToday: boolean
  isSelected: boolean
  isDirty: boolean
  slots: CalendarSlot[]
  onClick: () => void
}

export default function RosterCalendarDayCell({
  dayNumber,
  isOutsideMonth,
  isToday,
  isSelected,
  isDirty,
  slots,
  onClick,
}: RosterCalendarDayCellProps) {
  let cellStyles = 'bg-white border-slate-200'
  if (isOutsideMonth) cellStyles = 'bg-slate-50 border-slate-100'
  if (isSelected) cellStyles = 'bg-rose-50 border-rose-400 ring-1 ring-rose-400'
  if (isDirty) cellStyles = 'bg-rose-100 border-rose-300'
  if (isDirty && isSelected) cellStyles = 'bg-rose-100 border-rose-400 ring-1 ring-rose-400'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-stretch gap-0.5 p-1.5 min-h-[4.5rem] min-w-0 rounded-lg border text-left transition-colors ${cellStyles} ${isOutsideMonth ? 'opacity-50' : ''}`}
    >
      <span className="flex items-center gap-1 min-w-0">
        <span className={`text-[11px] font-bold shrink-0 ${isToday ? 'text-rose-600' : 'text-slate-500'}`}>{dayNumber}</span>
        {isToday && (
          <span className="hidden sm:inline text-[9px] font-bold uppercase tracking-wide text-rose-600 truncate">Today</span>
        )}
      </span>

      <div className="flex flex-col gap-0.5 min-w-0">
        {slots.length === 0 && (
          <span className="text-[10px] text-slate-300 italic">—</span>
        )}
        {slots.map(slot => (
          <span
            key={slot.id}
            className={`text-[10px] font-semibold truncate rounded px-1 py-0.5 ${
              slot.status === 'CANCELLED'
                ? 'bg-slate-100 text-slate-400 line-through'
                : slot.watchName === null
                ? 'bg-amber-50 text-amber-700'
                : 'bg-blue-50 text-blue-700'
            }`}
            title={`${slot.appliance}: ${slot.status === 'CANCELLED' ? 'Cancelled' : slot.watchName ?? 'Mixed'}`}
          >
            {slot.appliance}: {slot.status === 'CANCELLED' ? 'Cancelled' : slot.watchName ?? 'Mixed'}
          </span>
        ))}
      </div>
    </button>
  )
}
