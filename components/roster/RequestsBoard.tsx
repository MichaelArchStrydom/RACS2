'use client'

import { useState, useTransition } from 'react'
import StandInRequestItem from '@/components/roster/StandInRequestItem'
import { createStandInRequest } from '@/app/actions/rosterActions'

interface UserShift {
  assignmentId: string
  label: string       // display string for the dropdown option
  startIso: string    // ISO string — used to reconstruct the Date on submit
  endIso: string       // ISO string — used to compute quick-pick presets
  defaultStart: string // "HH:MM" pre-filled in the From input
  defaultEnd: string   // "HH:MM" pre-filled in the Until input
}

// "HH:MM" in NZ time for a given instant, independent of the viewer's own
// browser timezone — used for the quick-pick preset labels below.
function nzTimeStr(date: Date): string {
  return date.toLocaleTimeString('en-NZ', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit', hour12: false })
}

interface RequestsBoardProps {
  requests: any[]
  activeUserId: string
  userShifts: UserShift[]
}

export default function RequestsBoard({ requests, activeUserId, userShifts }: RequestsBoardProps) {
  const [showCovered, setShowCovered] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedShiftId, setSelectedShiftId] = useState('')
  const [coverStart, setCoverStart] = useState('')
  const [coverEnd, setCoverEnd] = useState('')
  const [isCreating, startCreateTransition] = useTransition()

  const filteredRequests = requests.filter(req => showCovered || req.status === 'PENDING')
  const pendingCount = requests.filter(r => r.status === 'PENDING').length

  const selectedShift = userShifts.find(s => s.assignmentId === selectedShiftId)

  // Quick-pick presets for the mobile chips: whole shift, or split at the
  // midpoint. Only used to prefill coverStart/coverEnd — submission still
  // goes through the same string fields as manual entry.
  const presets = (() => {
    if (!selectedShift) return null
    const start = new Date(selectedShift.startIso)
    const end = new Date(selectedShift.endIso)
    const mid = new Date((start.getTime() + end.getTime()) / 2)
    return {
      whole: { start: selectedShift.defaultStart, end: selectedShift.defaultEnd },
      first: { start: selectedShift.defaultStart, end: nzTimeStr(mid) },
      second: { start: nzTimeStr(mid), end: selectedShift.defaultEnd },
    }
  })()

  const handleShiftSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    setSelectedShiftId(id)
    const shift = userShifts.find(s => s.assignmentId === id)
    if (shift) {
      setCoverStart(shift.defaultStart)
      setCoverEnd(shift.defaultEnd)
    } else {
      setCoverStart('')
      setCoverEnd('')
    }
  }

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedShift) return

    const startDate = new Date(selectedShift.startIso)
    const [sh, sm] = coverStart.split(':').map(Number)
    startDate.setHours(sh, sm, 0, 0)

    const endDate = new Date(selectedShift.startIso)
    const [eh, em] = coverEnd.split(':').map(Number)
    endDate.setHours(eh, em, 0, 0)
    if (endDate.getTime() <= startDate.getTime()) {
      endDate.setDate(endDate.getDate() + 1)
    }

    startCreateTransition(async () => {
      await createStandInRequest(selectedShift.assignmentId, activeUserId, startDate, endDate)
      setShowCreateForm(false)
      setSelectedShiftId('')
      setCoverStart('')
      setCoverEnd('')
    })
  }

  return (
    <section className="bg-white p-5 rounded-xl shadow-sm border space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-rose-600 flex items-center gap-2">
          <span>Active Stand-In Requests</span>
          {pendingCount > 0 && (
            <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full text-xs font-bold">
              {pendingCount} Open
            </span>
          )}
        </h2>

        <div className="flex items-center gap-2 flex-wrap">
          {/* New: open the create-request form */}
          {userShifts.length > 0 && (
            <button
              type="button"
              onClick={() => setShowCreateForm(v => !v)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 transition-colors"
            >
              {showCreateForm ? '✕ Cancel' : '+ Request Cover'}
            </button>
          )}

          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border">
            <input
              type="checkbox"
              checked={showCovered}
              onChange={(e) => setShowCovered(e.target.checked)}
              className="rounded text-rose-500 focus:ring-rose-500 cursor-pointer"
            />
            Show Covered Shifts
          </label>
        </div>
      </div>

      {/* Create-request inline form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateSubmit}
          className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col gap-3"
        >
          <p className="text-xs font-semibold text-slate-600">Select one of your upcoming shifts and the hours you need covered:</p>

          <select
            value={selectedShiftId}
            onChange={handleShiftSelect}
            required
            className="w-full border rounded-lg px-3 py-2 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-400"
          >
            <option value="">— choose a shift —</option>
            {userShifts.map(s => (
              <option key={s.assignmentId} value={s.assignmentId}>{s.label}</option>
            ))}
          </select>

          {selectedShiftId && presets && (
            <div className="flex flex-col gap-3">
              {/* Quick-pick presets — mobile only. Desktop keeps direct entry. */}
              <div className="flex md:hidden gap-2">
                <button
                  type="button"
                  onClick={() => { setCoverStart(presets.whole.start); setCoverEnd(presets.whole.end) }}
                  className="flex-1 py-2 text-xs font-semibold rounded-lg border bg-white text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Whole Shift
                </button>
                <button
                  type="button"
                  onClick={() => { setCoverStart(presets.first.start); setCoverEnd(presets.first.end) }}
                  className="flex-1 py-2 text-xs font-semibold rounded-lg border bg-white text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  First Half
                </button>
                <button
                  type="button"
                  onClick={() => { setCoverStart(presets.second.start); setCoverEnd(presets.second.end) }}
                  className="flex-1 py-2 text-xs font-semibold rounded-lg border bg-white text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Second Half
                </button>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-slate-500">Cover From:</span>
                  {/* Desktop: compact free-text entry, unchanged */}
                  <input
                    type="text"
                    value={coverStart}
                    onChange={e => setCoverStart(e.target.value)}
                    required
                    className="hidden md:block w-16 bg-white border rounded px-2 py-1 text-center font-mono text-xs"
                  />
                  {/* Mobile: native time picker */}
                  <input
                    type="time"
                    value={coverStart}
                    onChange={e => setCoverStart(e.target.value)}
                    required
                    className="md:hidden min-w-[130px] bg-white border rounded px-2 py-2 font-mono text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-slate-500">Cover Until:</span>
                  <input
                    type="text"
                    value={coverEnd}
                    onChange={e => setCoverEnd(e.target.value)}
                    required
                    className="hidden md:block w-16 bg-white border rounded px-2 py-1 text-center font-mono text-xs"
                  />
                  <input
                    type="time"
                    value={coverEnd}
                    onChange={e => setCoverEnd(e.target.value)}
                    required
                    className="md:hidden min-w-[130px] bg-white border rounded px-2 py-2 font-mono text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="w-full md:w-auto py-2.5 md:py-1.5 px-4 bg-rose-500 hover:bg-rose-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded shadow-sm transition-colors text-xs"
                >
                  {isCreating ? 'Posting…' : 'Post Request'}
                </button>
              </div>
            </div>
          )}
        </form>
      )}

      {filteredRequests.length === 0 ? (
        <p className="text-xs text-slate-400 italic">
          {requests.length === 0
            ? "No active cover or stand-in requests for this period."
            : "No pending requests. Toggle 'Show Covered Shifts' to view history."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 divide-y divide-slate-100">
          {filteredRequests.map((request) => (
            <StandInRequestItem
              key={request.id}
              request={request}
              activeUserId={activeUserId}
            />
          ))}
        </div>
      )}
    </section>
  )
}
