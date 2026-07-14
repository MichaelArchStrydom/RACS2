'use client'

import { useState, useTransition, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import StandInRequestItem from '@/components/roster/StandInRequestItem'
import { createStandInRequest } from '@/app/actions/rosterActions'
import { normalizeTimeInput } from '@/lib/timezone'
import Spinner from '@/components/Spinner'
import { useRosterInteraction } from '@/components/roster/RosterInteractionContext'

interface UserShift {
  assignmentId: string
  label: string       // display string for the dropdown option
  startIso: string    // ISO string — used to reconstruct the Date on submit
  defaultStart: string // "HH:MM" pre-filled in the From input
  defaultEnd: string   // "HH:MM" pre-filled in the Until input
}

interface MemberOption {
  id: string
  firstName: string
  lastName: string
}

interface RequestsBoardProps {
  requests: any[]
  activeUserId: string
  userShifts: UserShift[]
  // Moderator extras — all optional; absent for normal members, whose UI is
  // unchanged from before the moderator feature existed.
  isModerator?: boolean
  memberOptions?: MemberOption[]
  allShifts?: (UserShift & { ownerId: string })[]
}

export default function RequestsBoard({
  requests,
  activeUserId,
  userShifts,
  isModerator = false,
  memberOptions = [],
  allShifts = [],
}: RequestsBoardProps) {
  const router = useRouter()
  const [showCovered, setShowCovered] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedShiftId, setSelectedShiftId] = useState('')
  const [coverStart, setCoverStart] = useState('')
  const [coverEnd, setCoverEnd] = useState('')
  const [isCreating, startCreateTransition] = useTransition()
  const [createError, setCreateError] = useState<string | null>(null)
  const { pendingShiftAssignmentId, pendingScrollRequestId, clearPendingShift, clearPendingScroll } = useRosterInteraction()
  const createFormRef = useRef<HTMLFormElement>(null)
  const [scrollToFormTrigger, setScrollToFormTrigger] = useState(0)

  // Moderator state: on-behalf mode adds a member-picker step above the
  // normal create form; cancelMode turns the whole board into an explicit
  // "deleting requests" state so cancels can't happen by accident.
  const [onBehalfMode, setOnBehalfMode] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [targetMemberId, setTargetMemberId] = useState('')
  const [cancelMode, setCancelMode] = useState(false)
  const [showModTools, setShowModTools] = useState(false)

  const filteredRequests = requests.filter(req => showCovered || req.status === 'PENDING')
  const pendingCount = requests.filter(r => r.status === 'PENDING').length

  // The shift pool the create form draws from: your own shifts normally, or
  // the chosen member's shifts in on-behalf mode.
  const shiftPool = onBehalfMode
    ? allShifts.filter(s => s.ownerId === targetMemberId)
    : userShifts
  const selectedShift = shiftPool.find(s => s.assignmentId === selectedShiftId)

  // Whose name the request will be posted under.
  const requestForId = onBehalfMode ? targetMemberId : activeUserId

  const matchingMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase()
    if (!q) return memberOptions
    return memberOptions.filter(m =>
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
      `${m.lastName} ${m.firstName}`.toLowerCase().includes(q)
    )
  }, [memberOptions, memberSearch])

  const resetCreateState = () => {
    setShowCreateForm(false)
    setOnBehalfMode(false)
    setMemberSearch('')
    setTargetMemberId('')
    setSelectedShiftId('')
    setCoverStart('')
    setCoverEnd('')
    setCreateError(null)
  }

  const handleShiftSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    setSelectedShiftId(id)
    const shift = shiftPool.find(s => s.assignmentId === id)
    if (shift) {
      setCoverStart(shift.defaultStart)
      setCoverEnd(shift.defaultEnd)
    } else {
      setCoverStart('')
      setCoverEnd('')
    }
  }

  // Mobile tap on your own uncovered cell (RosterCell) sets this — open the
  // create form pre-selected to that exact shift. The actual scroll is
  // handled by a SEPARATE effect below, keyed off scrollToFormTrigger —
  // setShowCreateForm(true) here only *schedules* a re-render, it doesn't put
  // the form in the DOM synchronously, so the form's ref is still null at
  // this point. A single requestAnimationFrame isn't reliably after React's
  // commit either (it's not React-aware), which is why the first tap looked
  // like it did nothing. A second effect that depends on the trigger value
  // is guaranteed to run after React has committed the form to the DOM —
  // React always commits before running effects for that render.
  useEffect(() => {
    if (!pendingShiftAssignmentId) return
    const shift = userShifts.find(s => s.assignmentId === pendingShiftAssignmentId)
    if (shift) {
      setShowCreateForm(true)
      setOnBehalfMode(false)
      setSelectedShiftId(shift.assignmentId)
      setCoverStart(shift.defaultStart)
      setCoverEnd(shift.defaultEnd)
      setScrollToFormTrigger(n => n + 1)
    }
    clearPendingShift()
  }, [pendingShiftAssignmentId, userShifts, clearPendingShift])

  // Only fires when the trigger above actually bumps (i.e. only for the
  // mobile-tap flow) — not on every render, and not when a shift is simply
  // picked from the dropdown during a manually-opened form.
  useEffect(() => {
    if (scrollToFormTrigger === 0) return
    createFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [scrollToFormTrigger])

  // Mobile tap on a cell that already has a pending request (yours or
  // someone else's) sets this — scroll straight to that request's existing
  // accept/retract form instead of making them scan the whole list.
  useEffect(() => {
    if (!pendingScrollRequestId) return
    const el = document.getElementById(`request-${pendingScrollRequestId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    clearPendingScroll()
  }, [pendingScrollRequestId, clearPendingScroll])

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedShift || !requestForId) return
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
        await createStandInRequest(selectedShift.assignmentId, requestForId, startDate, endDate)
        resetCreateState()
      } catch {
        setCreateError('Something went wrong posting this request — please try again.')
        router.refresh()
      }
    })
  }

  return (
    <section className={`p-5 rounded-xl shadow-sm border space-y-4 transition-colors ${cancelMode ? 'bg-rose-50 border-rose-300' : 'bg-white'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-rose-600 flex items-center gap-2">
          <span>Active Stand-In Requests</span>
          {pendingCount > 0 && (
            <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full text-xs font-bold">
              {pendingCount} Open
            </span>
          )}
          {cancelMode && (
            <span className="bg-rose-600 text-white px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide">
              Cancel Mode
            </span>
          )}
        </h2>

        <div className="flex items-center gap-2 flex-wrap">
          {cancelMode ? (
            /* Cancel mode: everything else disappears — one green exit. */
            <button
              type="button"
              onClick={() => setCancelMode(false)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border bg-green-50 text-green-700 border-green-300 hover:bg-green-100 transition-colors"
            >
              ✓ End Edit Mode
            </button>
          ) : (
            <>
              {/* New: open the create-request form */}
              {userShifts.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (showCreateForm && !onBehalfMode) { resetCreateState() } else {
                      resetCreateState()
                      setShowCreateForm(true)
                    }
                  }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 transition-colors"
                >
                  {showCreateForm && !onBehalfMode ? '✕ Cancel' : '+ Request Cover'}
                </button>
              )}

              {isModerator && (
                <button
                  type="button"
                  onClick={() => setShowModTools(v => !v)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${showModTools
                    ? 'bg-amber-100 text-amber-800 border-amber-400'
                    : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'}`}
                >
                  Moderator Controls {showModTools ? '▴' : '▾'}
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
            </>
          )}
        </div>
      </div>

      {/* Collapsible moderator tools row — keeps the main header compact,
          especially on mobile. */}
      {isModerator && showModTools && !cancelMode && (
        <div className="flex items-center gap-2 flex-wrap bg-amber-50 border border-amber-200 rounded-lg p-2">
          <button
            type="button"
            onClick={() => {
              if (showCreateForm && onBehalfMode) { resetCreateState() } else {
                resetCreateState()
                setShowCreateForm(true)
                setOnBehalfMode(true)
              }
            }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border bg-white text-amber-700 border-amber-300 hover:bg-amber-100 transition-colors"
          >
            {showCreateForm && onBehalfMode ? '✕ Cancel' : '+ Request Cover on Behalf'}
          </button>
          <button
            type="button"
            onClick={() => {
              resetCreateState()
              setCancelMode(true)
            }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border bg-white text-rose-600 border-rose-300 hover:bg-rose-100 transition-colors"
          >
            ✕ Cancel Someone's Cover
          </button>
        </div>
      )}

      {/* Create-request inline form (self or on-behalf) */}
      {showCreateForm && !cancelMode && (
        <form
          ref={createFormRef}
          onSubmit={handleCreateSubmit}
          className={`border rounded-lg p-4 flex flex-col gap-3 ${onBehalfMode ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}
        >
          {onBehalfMode ? (
            <p className="text-xs font-semibold text-amber-700">
              Posting a cover request ON BEHALF of another member
            </p>
          ) : (
            <p className="text-xs font-semibold text-slate-600">Select one of your upcoming shifts and the hours you need covered:</p>
          )}

          {createError && (
            <p className="text-[11px] font-semibold text-rose-600">{createError}</p>
          )}

          {/* On-behalf step 1: pick the member (searchable) */}
          {onBehalfMode && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                placeholder="Search member by name…"
                className="flex-1 border rounded-lg px-3 py-2 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              <select
                value={targetMemberId}
                onChange={e => {
                  setTargetMemberId(e.target.value)
                  setSelectedShiftId('')
                  setCoverStart('')
                  setCoverEnd('')
                }}
                required
                className="flex-1 border rounded-lg px-3 py-2 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                <option value="">— choose a member —</option>
                {matchingMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.lastName}, {m.firstName}</option>
                ))}
              </select>
            </div>
          )}

          {/* Shift picker — identical for both modes, just a different pool */}
          {(!onBehalfMode || targetMemberId) && (
            <select
              value={selectedShiftId}
              onChange={handleShiftSelect}
              required
              className="w-full border rounded-lg px-3 py-2 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-400"
            >
              <option value="">
                {shiftPool.length === 0 ? '— no visible shifts for this member —' : '— choose a shift —'}
              </option>
              {shiftPool.map(s => (
                <option key={s.assignmentId} value={s.assignmentId}>{s.label}</option>
              ))}
            </select>
          )}

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
            <div key={request.id} id={`request-${request.id}`}>
              <StandInRequestItem
                request={request}
                activeUserId={activeUserId}
                cancelMode={cancelMode}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
