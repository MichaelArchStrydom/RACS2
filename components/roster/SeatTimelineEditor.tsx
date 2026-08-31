'use client'

import { useEffect, useRef, useState } from 'react'
import { useRosterInteraction, cellKeyStr, type DraftAssignment } from './RosterInteractionContext'
import { snapToHalfHour } from '@/lib/timeSnap'
import { planInsertion, type TimelineSegment } from '@/lib/timelineInsert'
import { formatNZTime, setNZHours, normalizeTimeInput } from '@/lib/timezone'

interface MemberOption {
  id: string
  firstName: string
  lastName: string
}

export interface SeatToEdit {
  dateStr: string
  applianceName: string
  applianceRole: string
  label: string
  assignments: any[]
  shiftBounds: { start: Date; end: Date }
}

interface DraftSegment {
  key: string
  member: MemberOption | null
  start: Date
  end: Date
}

interface SeatTimelineEditorProps {
  seat: SeatToEdit
  memberOptions: MemberOption[]
  onClose: () => void
}

let tempKeyCounter = 0
function nextTempKey() {
  tempKeyCounter += 1
  return `new-${tempKeyCounter}`
}

function displayName(member: MemberOption | null): string {
  return member ? `${member.lastName}, ${member.firstName.charAt(0)}.` : 'Unassigned'
}

const MIN_SEGMENT_MS = 30 * 60_000

export default function SeatTimelineEditor({ seat, memberOptions, onClose }: SeatTimelineEditorProps) {
  const { setCellDraft } = useRosterInteraction()
  const bounds = seat.shiftBounds
  const [segments, setSegments] = useState<DraftSegment[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [memberSearch, setMemberSearch] = useState('')
  const [overlapError, setOverlapError] = useState<string | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSegments(
      seat.assignments.map((a) => {
        const owner = a.actualMemberId ? a.actualMember : a.member
        return {
          key: a.id,
          member: owner ? { id: owner.id, firstName: owner.firstName, lastName: owner.lastName } : null,
          start: new Date(a.startTime),
          end: new Date(a.endTime),
        }
      })
    )
    setOverlapError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seat])

  function pushDraft(list: DraftSegment[]) {
    const sorted = [...list].sort((a, b) => a.start.getTime() - b.start.getTime())
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start.getTime() < sorted[i - 1].end.getTime()) {
        setOverlapError('Segments overlap — adjust the times before they can be applied.')
        return
      }
    }
    setOverlapError(null)

    const cellKey = cellKeyStr({ dateStr: seat.dateStr, applianceName: seat.applianceName, applianceRole: seat.applianceRole })
    const mapped: DraftAssignment[] = list
      .filter((s): s is DraftSegment & { member: MemberOption } => !!s.member)
      .map((s) => ({
        id: s.key,
        memberId: s.member.id,
        member: s.member,
        actualMemberId: null,
        actualMember: null,
        startTime: s.start,
        endTime: s.end,
      }))
    setCellDraft(cellKey, mapped)
  }

  const matchingMembers = memberOptions.filter((m) => {
    const q = memberSearch.trim().toLowerCase()
    if (!q) return true
    return `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) || `${m.lastName} ${m.firstName}`.toLowerCase().includes(q)
  })

  function toTimelineSegments(list: DraftSegment[]): TimelineSegment[] {
    return list.map((s) => ({ id: s.key, start: s.start, end: s.end }))
  }

  function updateSegment(key: string, patch: Partial<DraftSegment>) {
    setSegments((prev) => {
      const next = prev.map((s) => (s.key === key ? { ...s, ...patch } : s))
      pushDraft(next)
      return next
    })
  }

  function removeSegment(key: string) {
    setSegments((prev) => {
      const next = prev.filter((s) => s.key !== key)
      pushDraft(next)
      return next
    })
  }

  function assignMember(key: string, member: MemberOption) {
    updateSegment(key, { member })
    setEditingKey(null)
    setMemberSearch('')
  }

  const dragRef = useRef<{
    key: string
    mode: 'move' | 'resize-start' | 'resize-end'
    pointerId: number
    startX: number
    originalStart: Date
    originalEnd: Date
  } | null>(null)

  function pxToMinutes(dx: number): number {
    if (!trackRef.current) return 0
    const trackWidth = trackRef.current.getBoundingClientRect().width
    const totalMinutes = (bounds.end.getTime() - bounds.start.getTime()) / 60_000
    return (dx / trackWidth) * totalMinutes
  }

  function handleSegPointerDown(e: React.PointerEvent, seg: DraftSegment, mode: 'move' | 'resize-start' | 'resize-end') {
    e.stopPropagation()
      ; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { key: seg.key, mode, pointerId: e.pointerId, startX: e.clientX, originalStart: seg.start, originalEnd: seg.end }
  }

  function handleSegPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const deltaMinutes = pxToMinutes(e.clientX - drag.startX)

    setSegments((prev) => {
      const others = prev.filter((s) => s.key !== drag.key).sort((a, b) => a.start.getTime() - b.start.getTime())
      let newStart = drag.originalStart
      let newEnd = drag.originalEnd

      if (drag.mode === 'move') {
        const durationMs = drag.originalEnd.getTime() - drag.originalStart.getTime()
        newStart = snapToHalfHour(new Date(drag.originalStart.getTime() + deltaMinutes * 60_000))
        newEnd = new Date(newStart.getTime() + durationMs)
        if (newStart.getTime() < bounds.start.getTime()) { newStart = bounds.start; newEnd = new Date(newStart.getTime() + durationMs) }
        if (newEnd.getTime() > bounds.end.getTime()) { newEnd = bounds.end; newStart = new Date(newEnd.getTime() - durationMs) }
        const prevNeighbor = [...others].reverse().find((o) => o.end.getTime() <= drag.originalStart.getTime())
        const nextNeighbor = others.find((o) => o.start.getTime() >= drag.originalEnd.getTime())
        if (prevNeighbor && newStart.getTime() < prevNeighbor.end.getTime()) { newStart = prevNeighbor.end; newEnd = new Date(newStart.getTime() + durationMs) }
        if (nextNeighbor && newEnd.getTime() > nextNeighbor.start.getTime()) { newEnd = nextNeighbor.start; newStart = new Date(newEnd.getTime() - durationMs) }
      } else if (drag.mode === 'resize-start') {
        newStart = snapToHalfHour(new Date(drag.originalStart.getTime() + deltaMinutes * 60_000))
        const prevNeighbor = [...others].reverse().find((o) => o.end.getTime() <= drag.originalStart.getTime())
        const minStart = prevNeighbor ? prevNeighbor.end : bounds.start
        if (newStart.getTime() < minStart.getTime()) newStart = minStart
        if (newStart.getTime() > drag.originalEnd.getTime() - MIN_SEGMENT_MS) newStart = new Date(drag.originalEnd.getTime() - MIN_SEGMENT_MS)
      } else {
        newEnd = snapToHalfHour(new Date(drag.originalEnd.getTime() + deltaMinutes * 60_000))
        const nextNeighbor = others.find((o) => o.start.getTime() >= drag.originalEnd.getTime())
        const maxEnd = nextNeighbor ? nextNeighbor.start : bounds.end
        if (newEnd.getTime() > maxEnd.getTime()) newEnd = maxEnd
        if (newEnd.getTime() < drag.originalStart.getTime() + MIN_SEGMENT_MS) newEnd = new Date(drag.originalStart.getTime() + MIN_SEGMENT_MS)
      }

      return prev.map((s) => (s.key === drag.key ? { ...s, start: newStart, end: newEnd } : s))
    })
  }

  function handleSegPointerUp(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    // Dragging either end down to (near) zero length is the delete gesture.
    setSegments((prev) => {
      const next = prev.filter((s) => s.key !== drag.key || s.end.getTime() - s.start.getTime() >= MIN_SEGMENT_MS)
      pushDraft(next)
      return next
    })
  }

  const addDragRef = useRef<{ pointerId: number; ghostEl: HTMLDivElement | null } | null>(null)

  function handleAddPointerDown(e: React.PointerEvent) {
    ; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const ghost = document.createElement('div')
    ghost.textContent = '+ New'
    Object.assign(ghost.style, {
      position: 'fixed', pointerEvents: 'none', zIndex: '9999',
      padding: '4px 8px', borderRadius: '6px',
      background: 'rgba(100, 116, 139, 0.9)', color: 'white',
      fontSize: '11px', fontWeight: '600',
      boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
      transform: 'translate(-100%, -100%)',
    })
    document.body.appendChild(ghost)
    ghost.style.left = `${e.clientX - 12}px`
    ghost.style.top = `${e.clientY - 12}px`
    addDragRef.current = { pointerId: e.pointerId, ghostEl: ghost }
  }

  function handleAddPointerMove(e: React.PointerEvent) {
    const drag = addDragRef.current
    if (!drag || drag.pointerId !== e.pointerId || !drag.ghostEl) return
    drag.ghostEl.style.left = `${e.clientX - 12}px`
    drag.ghostEl.style.top = `${e.clientY - 12}px`
  }

  function applyInsertionPlan(dropInstant?: Date) {
    const plan = planInsertion(toTimelineSegments(segments), bounds.start, bounds.end, 60, dropInstant)
    setSegments((prev) => {
      const resizedById = new Map(plan.resized.map((r) => [r.id, r]))
      const kept = prev
        .filter((s) => !plan.removed.includes(s.key))
        .map((s) => (resizedById.has(s.key) ? { ...s, start: resizedById.get(s.key)!.start, end: resizedById.get(s.key)!.end } : s))
      const next = [...kept, { key: nextTempKey(), member: null, start: plan.newSegment.start, end: plan.newSegment.end }]
      pushDraft(next)
      return next
    })
  }

  function handleAddPointerUp(e: React.PointerEvent) {
    const drag = addDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    addDragRef.current = null
    drag.ghostEl?.remove()

    if (!trackRef.current) return
    const trackRect = trackRef.current.getBoundingClientRect()
    const withinTrackArea = e.clientX >= trackRect.left && e.clientX <= trackRect.right &&
      e.clientY >= trackRect.top - 60 && e.clientY <= trackRect.bottom + 60
    if (!withinTrackArea) return // dropped well away from the track — ignore

    const totalMs = bounds.end.getTime() - bounds.start.getTime()
    const fraction = Math.min(1, Math.max(0, (e.clientX - trackRect.left) / trackRect.width))
    applyInsertionPlan(new Date(bounds.start.getTime() + fraction * totalMs))
  }

  function handleTypedTimeChange(seg: DraftSegment, field: 'start' | 'end', value: string) {
    const [h, m] = value.split(':').map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) return
    const updated = snapToHalfHour(setNZHours(seg[field], h, m))
    updateSegment(seg.key, { [field]: updated })
  }

  function computeHourMarks(start: Date, end: Date): { label: string; leftPct: number }[] {
    const totalMs = end.getTime() - start.getTime()
    if (totalMs <= 0) return []
    const startMinutes = Number(formatNZTime(start).split(':')[1])
    const firstMarkMs = startMinutes === 0 ? start.getTime() : start.getTime() + (60 - startMinutes) * 60_000
    const marks: { label: string; leftPct: number }[] = []
    for (let t = firstMarkMs; t < end.getTime(); t += 3_600_000) {
      marks.push({ label: formatNZTime(new Date(t)).slice(0, 2), leftPct: ((t - start.getTime()) / totalMs) * 100 })
    }
    return marks
  }

  const sortedSegments = [...segments].sort((a, b) => a.start.getTime() - b.start.getTime())

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl border w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">{seat.label}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xs font-semibold">✕</button>
        </div>

        {overlapError && <p className="text-xs font-semibold text-rose-600">{overlapError}</p>}

        <p className="text-[11px] text-slate-500">
          {formatNZTime(bounds.start)} – {formatNZTime(bounds.end)} · drag to reorder, drag an edge to resize (30-min steps), drag either end to zero to delete
        </p>

        <div ref={trackRef} className="relative h-14 bg-slate-100 rounded-lg border overflow-hidden">
          {sortedSegments.map((seg) => {
            const total = bounds.end.getTime() - bounds.start.getTime()
            const leftPct = ((seg.start.getTime() - bounds.start.getTime()) / total) * 100
            const widthPct = ((seg.end.getTime() - seg.start.getTime()) / total) * 100
            return (
              <div
                key={seg.key}
                className={`absolute top-1 bottom-1 rounded border flex items-center px-2 text-[9px] font-semibold overflow-hidden select-none cursor-grab active:cursor-grabbing ${seg.member ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-slate-200 border-slate-300 text-slate-500 italic'}`}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                onPointerDown={(e) => handleSegPointerDown(e, seg, 'move')}
                onPointerMove={handleSegPointerMove}
                onPointerUp={handleSegPointerUp}
                onClick={(e) => { e.stopPropagation(); setEditingKey(seg.key) }}
              >
                <div
                  className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize"
                  style={{ touchAction: 'none' }}
                  onPointerDown={(e) => handleSegPointerDown(e, seg, 'resize-start')}
                  onPointerMove={handleSegPointerMove}
                  onPointerUp={handleSegPointerUp}
                />
                <span className="truncate mx-auto">{displayName(seg.member)}</span>
                <div
                  className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize"
                  style={{ touchAction: 'none' }}
                  onPointerDown={(e) => handleSegPointerDown(e, seg, 'resize-end')}
                  onPointerMove={handleSegPointerMove}
                  onPointerUp={handleSegPointerUp}
                />
              </div>
            )
          })}
        </div>
        <div className="relative h-3.5">
          {computeHourMarks(bounds.start, bounds.end).map((mark, i) => (
            <span
              key={i}
              className="absolute top-0 text-[8px] text-slate-400 font-mono -translate-x-1/2"
              style={{ left: `${mark.leftPct}%` }}
            >
              {mark.label}
            </span>
          ))}
        </div>

        <div
          onPointerDown={handleAddPointerDown}
          onPointerMove={handleAddPointerMove}
          onPointerUp={handleAddPointerUp}
          style={{ touchAction: 'none' }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-xs font-semibold text-slate-500 cursor-grab active:cursor-grabbing select-none"
        >
          + Add someone (drag onto the scale)
        </div>

        {editingKey && (
          <div className="border rounded-lg p-3 bg-amber-50 border-amber-200 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-amber-700">Assign to this segment</p>
              <button type="button" onClick={() => setEditingKey(null)} className="text-[11px] px-1.5 text-slate-500">x</button>
            </div>
            <input
              type="text"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search"
              className="w-full border rounded-lg px-3 py-2 text-base md:text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <div className="max-h-32 overflow-y-auto divide-y">
              {matchingMembers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => assignMember(editingKey, m)}
                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-amber-100"
                >
                  {m.lastName}, {m.firstName}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { removeSegment(editingKey); setEditingKey(null) }}
              className="text-[11px] font-semibold text-rose-600"
            >
              Remove this segment
            </button>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Or edit directly</p>
          {sortedSegments.length === 0 && (
            <p className="text-[11px] text-slate-400 italic">No segments — this whole shift is open.</p>
          )}
          {sortedSegments.map((seg) => (
            <div key={seg.key} className="flex flex-wrap items-center gap-2 bg-slate-50 border rounded-lg p-2">
              <span className="text-xs font-medium text-slate-700 flex-1 min-w-[120px]">{displayName(seg.member)}</span>
              <input
                key={`start-${seg.start.getTime()}`}
                type="text"
                defaultValue={formatNZTime(seg.start)}
                onBlur={(e) => handleTypedTimeChange(seg, 'start', normalizeTimeInput(e.target.value))}
                className="hidden md:block border rounded px-2 py-1 w-16 text-center text-xs font-mono"
              />
              <input
                type="time"
                lang="en-GB"
                value={formatNZTime(seg.start)}
                onChange={(e) => handleTypedTimeChange(seg, 'start', e.target.value)}
                className="md:hidden border rounded px-2 py-2 min-w-[130px] text-base font-mono"
              />
              <span className="text-xs text-slate-400">–</span>
              <input
                key={`end-${seg.end.getTime()}`}
                type="text"
                defaultValue={formatNZTime(seg.end)}
                onBlur={(e) => handleTypedTimeChange(seg, 'end', normalizeTimeInput(e.target.value))}
                className="hidden md:block border rounded px-2 py-1 w-16 text-center text-xs font-mono"
              />
              <input
                type="time"
                lang="en-GB"
                value={formatNZTime(seg.end)}
                onChange={(e) => handleTypedTimeChange(seg, 'end', e.target.value)}
                className="md:hidden border rounded px-2 py-2 min-w-[130px] text-base font-mono"
              />
              <button type="button" onClick={() => setEditingKey(seg.key)} className="text-[11px] font-semibold text-amber-600">Reassign</button>
              <button type="button" onClick={() => removeSegment(seg.key)} className="text-[11px] font-semibold text-rose-600">Remove</button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => applyInsertionPlan()}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 border border-dashed border-slate-300 rounded-lg px-3 py-1.5"
          >
            + Add segment
          </button>
        </div>
      </div>
    </div>
  )
}
