'use client'

import { useMemo, useState, useTransition } from 'react'
import { getMonthGridDateStrings, addMonthsToMonthString } from '@/lib/timezone'
import { applyRosterCalendarChanges, getRosterCalendarMonth, type RosterCalendarChange } from '@/app/actions/adminActions'
import Spinner from '@/components/Spinner'
import RosterCalendarDayCell from './RosterCalendarDayCell'
import RosterCalendarDetailPanel from './RosterCalendarDetailPanel'
import type { CalendarSlot, MonthSlotsByDate, CrewOption, ApplianceOption } from './RosterCalendarTypes'

interface RosterCalendarEditorProps {
  initialMonthStr: string // "YYYY-MM" of the month the page was first loaded with
  initialSlotsByDate: MonthSlotsByDate
  crews: CrewOption[]
  appliances: ApplianceOption[]
  adminId: string
  todayStr: string
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function applyOverlay(
  baseSlots: CalendarSlot[],
  changes: RosterCalendarChange[],
  crews: CrewOption[],
  dateStr: string
): CalendarSlot[] {
  let slots = baseSlots.map(s => ({ ...s }))
  for (const change of changes) {
    if (change.type === 'cancel') {
      slots = slots.map(s => (s.id === change.slotId ? { ...s, status: 'CANCELLED' } : s))
    } else if (change.type === 'replaceCrew') {
      const crew = crews.find(c => c.id === change.crewId)
      slots = slots.map(s =>
        s.id === change.slotId ? { ...s, watchName: crew?.watchName ?? 'Pending…', assignments: [] } : s
      )
    } else if (change.type === 'addAppliance') {
      const crew = crews.find(c => c.id === change.crewId)
      slots = [
        ...slots,
        {
          id: `pending-${dateStr}-${change.applianceName}`,
          appliance: change.applianceName,
          status: 'LIVE',
          watchName: crew?.watchName ?? 'Pending…',
          assignments: [],
        },
      ]
    }
  }
  return slots
}

export default function RosterCalendarEditor({
  initialMonthStr,
  initialSlotsByDate,
  crews,
  appliances,
  adminId,
  todayStr,
}: RosterCalendarEditorProps) {
  // Month + slot data are owned client-side from here on — switching months
  // fetches fresh data in the background instead of navigating the page, so
  // the selected day, any open mode, and pending edits all survive the switch.
  const [monthStr, setMonthStr] = useState(initialMonthStr)
  const [slotsByDate, setSlotsByDate] = useState(initialSlotsByDate)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [pendingChanges, setPendingChanges] = useState<Record<string, RosterCalendarChange[]>>({})
  const [isSaving, startSaving] = useTransition()
  const [isLoadingMonth, startLoadingMonth] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const gridDates = useMemo(() => getMonthGridDateStrings(monthStr), [monthStr])

  const effectiveSlotsByDate = useMemo(() => {
    const result: MonthSlotsByDate = {}
    for (const dateStr of gridDates) {
      const base = slotsByDate[dateStr] ?? []
      const changes = pendingChanges[dateStr] ?? []
      result[dateStr] = changes.length > 0 ? applyOverlay(base, changes, crews, dateStr) : base
    }
    return result
  }, [gridDates, slotsByDate, pendingChanges, crews])

  const dirtyCount = Object.values(pendingChanges).filter(c => c.length > 0).length
  const totalChangeCount = Object.values(pendingChanges).reduce((sum, c) => sum + c.length, 0)

  const queueChange = (dateStr: string, change: RosterCalendarChange) => {
    setPendingChanges(prev => ({ ...prev, [dateStr]: [...(prev[dateStr] ?? []), change] }))
  }

  const handleDiscardPending = () => {
    if (!selectedDate) return
    setPendingChanges(prev => {
      const next = { ...prev }
      delete next[selectedDate]
      return next
    })
  }

  // Merges freshly-fetched data in rather than replacing state outright, so
  // months already visited this session stay available — e.g. the detail
  // panel can still show a previously-selected day's real data even after
  // navigating to a different month.
  const refetchMonth = (targetMonthStr: string) => {
    setLoadError(null)
    startLoadingMonth(async () => {
      try {
        const data = await getRosterCalendarMonth(adminId, targetMonthStr)
        setSlotsByDate(prev => ({ ...prev, ...data }))
      } catch (e: any) {
        setLoadError(e?.message ?? 'Could not load that month.')
      }
    })
  }

  const goToMonth = (targetMonthStr: string) => {
    setMonthStr(targetMonthStr)
    refetchMonth(targetMonthStr)
  }

  const handleSaveAll = () => {
    setSaveError(null)
    const allChanges = Object.values(pendingChanges).flat()
    startSaving(async () => {
      try {
        await applyRosterCalendarChanges(adminId, allChanges)
        setPendingChanges({})
        refetchMonth(monthStr)
      } catch (e: any) {
        setSaveError(e?.message ?? 'Something went wrong saving these changes.')
      }
    })
  }

  const weeks: string[][] = []
  for (let i = 0; i < gridDates.length; i += 7) weeks.push(gridDates.slice(i, i + 7))

  const monthLabel = useMemo(
    () =>
      new Date(`${monthStr}-01T00:00:00Z`).toLocaleDateString('en-NZ', {
        month: 'long', year: 'numeric', timeZone: 'UTC',
      }),
    [monthStr]
  )

  const selectedDateLabel = selectedDate
    ? new Date(`${selectedDate}T00:00:00Z`).toLocaleDateString('en-NZ', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
      })
    : ''

  return (
    <section className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700 whitespace-nowrap">Visual Roster Calendar</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goToMonth(addMonthsToMonthString(monthStr, -1))}
            className="whitespace-nowrap px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border rounded-lg text-xs font-semibold text-slate-700 transition-colors"
          >
            ← Prev
          </button>
          <span className="whitespace-nowrap flex items-center gap-1.5 text-xs font-mono font-semibold text-slate-500 px-2">
            {monthLabel}
            {isLoadingMonth && <Spinner className="w-3 h-3" />}
          </span>
          <button
            type="button"
            onClick={() => goToMonth(addMonthsToMonthString(monthStr, 1))}
            className="whitespace-nowrap px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border rounded-lg text-xs font-semibold text-slate-700 transition-colors"
          >
            Next →
          </button>
        </div>
      </div>

      {loadError && <p className="text-xs font-semibold text-rose-600">{loadError}</p>}

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map(label => (
          <div key={label} className="text-center text-[10px] font-bold uppercase tracking-wide text-slate-400 py-1">
            {label}
          </div>
        ))}
        {weeks.map((week, wi) =>
          week.map(dateStr => (
            <RosterCalendarDayCell
              key={`${wi}-${dateStr}`}
              dayNumber={Number(dateStr.slice(8, 10))}
              isOutsideMonth={dateStr.slice(0, 7) !== monthStr}
              isToday={dateStr === todayStr}
              isSelected={dateStr === selectedDate}
              isDirty={(pendingChanges[dateStr] ?? []).length > 0}
              slots={effectiveSlotsByDate[dateStr] ?? []}
              onClick={() => setSelectedDate(prev => (prev === dateStr ? null : dateStr))}
            />
          ))
        )}
      </div>

      {selectedDate && (
        <RosterCalendarDetailPanel
          dateStr={selectedDate}
          dateLabel={selectedDateLabel}
          slots={effectiveSlotsByDate[selectedDate] ?? []}
          crews={crews}
          appliances={appliances}
          adminId={adminId}
          hasPendingChanges={(pendingChanges[selectedDate] ?? []).length > 0}
          onQueueCancel={slotId => queueChange(selectedDate, { type: 'cancel', slotId })}
          onQueueReplaceCrew={(slotId, crewId) => queueChange(selectedDate, { type: 'replaceCrew', slotId, crewId })}
          onQueueAddAppliance={(applianceName, crewId) =>
            queueChange(selectedDate, { type: 'addAppliance', dateStr: selectedDate, applianceName, crewId })
          }
          onDiscardPending={handleDiscardPending}
          onClose={() => setSelectedDate(null)}
          onAutogenerated={() => refetchMonth(monthStr)}
        />
      )}

      {dirtyCount > 0 && (
        <div className="sticky bottom-4 flex items-center justify-between gap-3 bg-slate-900 text-white rounded-xl shadow-lg px-4 py-3">
          <span className="text-xs font-semibold">
            {totalChangeCount} unsaved change{totalChangeCount === 1 ? '' : 's'} across {dirtyCount} day{dirtyCount === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            {saveError && <span className="text-xs font-semibold text-rose-300">{saveError}</span>}
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveAll}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-500 hover:bg-rose-600 disabled:bg-slate-600 text-white text-xs font-bold rounded-lg transition-colors"
            >
              {isSaving && <Spinner className="w-3.5 h-3.5" />}
              {isSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
