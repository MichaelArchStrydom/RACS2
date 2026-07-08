'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import StandInRequestItem from '@/components/roster/StandInRequestItem'
import { createStandInRequest } from '@/app/actions/rosterActions'
import { normalizeTimeInput } from '@/lib/timezone'
import Spinner from '@/components/Spinner'

interface UserShift {
  assignmentId: string
  label: string       // display string for the dropdown option
  startIso: string    // ISO string — used to reconstruct the Date on submit
  defaultStart: string // "HH:MM" pre-filled in the From input
  defaultEnd: string   // "HH:MM" pre-filled in the Until input
}

interface RequestsBoardProps {
  requests: any[]
  activeUserId: string
  userShifts: UserShift[]
}

export default function RequestsBoard({ requests, activeUserId, userShifts }: RequestsBoardProps) {
  const router = useRouter()
  const [showCovered, setShowCovered] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedShiftId, setSelectedShiftId] = useState('')
  const [coverStart, setCoverStart] = useState('')
  const [coverEnd, setCoverEnd] = useState('')
  const [isCreating, startCreateTransition] = useTransition()
  const [createError, setCreateError] = useState<string | null>(null)

  const filteredRequests = requests.filter(req => showCovered || req.status === 'PENDING')
  const pendingCount = requests.filter(r => r.status === 'PENDING').length

  const selectedShift = userShifts.find(s => s.assignmentId === selectedShiftId)

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
    setCreateError(null)

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
      try {
        await createStandInRequest(selectedShift.assignmentId, activeUserId, startDate, endDate)
        setShowCreateForm(false)
        setSelectedShiftId('')
        setCoverStart('')
        setCoverEnd('')
      } catch {
        setCreateError('Something went wrong posting this request — please try again.')
        router.refresh()
      }
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

          {createError && (
            <p className="text-[11px] font-semibold text-rose-600">{createError}</p>
          )}

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

          {selectedShiftId && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-slate-500">Cover From:</span>
                {/* Desktop: compact free-text entry. Typing just an hour
                    ("7" or "17") and blurring auto-formats to "HH:00". */}
                <input
                  type="text"
                  value={coverStart}
                  onChange={e => setCoverStart(e.target.value)}
                  onBlur={e => setCoverStart(normalizeTimeInput(e.target.value))}
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
                  onBlur={e => setCoverEnd(normalizeTimeInput(e.target.value))}
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
                className="flex items-center justify-center gap-1.5 w-full md:w-auto py-2.5 md:py-1.5 px-4 bg-rose-500 hover:bg-rose-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded shadow-sm transition-colors text-xs"
              >
                {isCreating && <Spinner className="w-3.5 h-3.5" />}
                {isCreating ? 'Posting…' : 'Post Request'}
              </button>
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
