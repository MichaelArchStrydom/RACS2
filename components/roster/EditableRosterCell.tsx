'use client'

import { useRef } from 'react'
import { useRosterInteraction, cellKeyStr } from './RosterInteractionContext'
import { formatNZTime } from '@/lib/timezone'
import { planInsertion } from '@/lib/timelineInsert'

interface EditableRosterCellProps {
  assignments: any[]
  slotRequests: any[]
  activeUserId: string
  shiftBounds: { start: Date; end: Date }
  dateStr: string
  applianceName: string
  applianceRole: string
  cellLabel: string
}

const DRAG_THRESHOLD_PX = 8

interface DragState {
  pointerId: number
  startX: number
  startY: number
  dragging: boolean
  ghostEl: HTMLDivElement | null
  memberId: string
  memberFirstName: string
  memberLastName: string
  lastHoverKey: string | null
}

//This feature was inspired by the ios homescreen
export default function EditableRosterCell({
  assignments, slotRequests, activeUserId, shiftBounds,
  dateStr, applianceName, applianceRole, cellLabel,
}: EditableRosterCellProps) {
  const { openEditPanel, dragSourceKey, dragHoverKey, draggingMember, setDragState, applyCellMove } = useRosterInteraction()
  const dragState = useRef<DragState | null>(null)
  const thisCellKey = cellKeyStr({ dateStr, applianceName, applianceRole })

  function computeGaps(): { start: Date; end: Date }[] {
    const sorted = [...assignments].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    const gaps: { start: Date; end: Date }[] = []
    let cursor = shiftBounds.start
    for (const a of sorted) {
      const start = new Date(a.startTime)
      const end = new Date(a.endTime)
      if (start.getTime() > cursor.getTime()) gaps.push({ start: cursor, end: start })
      if (end.getTime() > cursor.getTime()) cursor = end
    }
    if (shiftBounds.end.getTime() > cursor.getTime()) gaps.push({ start: cursor, end: shiftBounds.end })
    return gaps
  }

  function openPanel() {
    openEditPanel({ dateStr, applianceName, applianceRole, label: cellLabel, assignments, shiftBounds })
  }

  function handlePointerDown(e: React.PointerEvent, assignment: any) {
    const owner = assignment.actualMemberId ? assignment.actualMember : assignment.member
    if (!owner) return
      ; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
      ghostEl: null,
      memberId: owner.id,
      memberFirstName: owner.firstName,
      memberLastName: owner.lastName,
      lastHoverKey: null,
    }
  }

  function hitTestCellKey(clientX: number, clientY: number): string | null {
    const dropEl = document.elementFromPoint(clientX, clientY)?.closest('[data-date-key]') as HTMLElement | null
    const targetDate = dropEl?.dataset.dateKey
    const targetAppliance = dropEl?.dataset.appliance
    const targetRole = dropEl?.dataset.role
    if (!targetDate || !targetAppliance || !targetRole) return null
    return cellKeyStr({ dateStr: targetDate, applianceName: targetAppliance, applianceRole: targetRole })
  }

  function handlePointerMove(e: React.PointerEvent) {
    const state = dragState.current
    if (!state || state.pointerId !== e.pointerId) return

    const dx = e.clientX - state.startX
    const dy = e.clientY - state.startY

    if (!state.dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      state.dragging = true
      const ghost = document.createElement('div')
      ghost.textContent = `${state.memberLastName}, ${state.memberFirstName.charAt(0)}.`
      Object.assign(ghost.style, {
        position: 'fixed', pointerEvents: 'none', zIndex: '9999',
        padding: '4px 8px', borderRadius: '6px',
        background: 'rgba(225, 29, 72, 0.9)', color: 'white',
        fontSize: '11px', fontWeight: '600',
        boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
        transform: 'translate(-100%, -100%)',
      })
      document.body.appendChild(ghost)
      state.ghostEl = ghost
    }

    if (state.ghostEl) {
      state.ghostEl.style.left = `${e.clientX - 12}px`
      state.ghostEl.style.top = `${e.clientY - 12}px`
    }

    const hoverKey = hitTestCellKey(e.clientX, e.clientY)
    if (hoverKey !== state.lastHoverKey) {
      state.lastHoverKey = hoverKey
      setDragState(thisCellKey, hoverKey, { id: state.memberId, firstName: state.memberFirstName, lastName: state.memberLastName })
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    const state = dragState.current
    if (!state || state.pointerId !== e.pointerId) return
    dragState.current = null
    state.ghostEl?.remove()
    setDragState(null, null, null)

    if (!state.dragging) {
      // tap not a drag.
      openPanel()
      return
    }

    const dropEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-date-key]') as HTMLElement | null
    const targetDate = dropEl?.dataset.dateKey
    const targetAppliance = dropEl?.dataset.appliance
    const targetRole = dropEl?.dataset.role
    const targetShiftStart = dropEl?.dataset.shiftStart
    const targetShiftEnd = dropEl?.dataset.shiftEnd

    const isSameCell = targetDate === dateStr && targetAppliance === applianceName && targetRole === applianceRole
    if (!targetDate || !targetAppliance || !targetRole || !targetShiftStart || !targetShiftEnd || isSameCell) {
      return
    }

    applyCellMove(
      thisCellKey,
      {
        dateStr: targetDate, applianceName: targetAppliance, applianceRole: targetRole,
        shiftStart: new Date(targetShiftStart), shiftEnd: new Date(targetShiftEnd),
      },
      { id: state.memberId, firstName: state.memberFirstName, lastName: state.memberLastName }
    )
  }

  const gaps = computeGaps()

  type NormalItem =
    | { kind: 'assignment'; sortKey: number; assignment: any }
    | { kind: 'gap'; sortKey: number; start: Date; end: Date }

  const normalItems: NormalItem[] = [
    ...assignments.map((a: any): NormalItem => ({ kind: 'assignment', sortKey: new Date(a.startTime).getTime(), assignment: a })),
    ...gaps.map((g): NormalItem => ({ kind: 'gap', sortKey: g.start.getTime(), start: g.start, end: g.end })),
  ].sort((a, b) => a.sortKey - b.sortKey)

  const isPreviewTarget = !!draggingMember && dragHoverKey === thisCellKey && dragSourceKey !== thisCellKey
  let previewGhostRange: { start: Date; end: Date } | null = null
  const previewResizedById = new Map<string, { start: Date; end: Date }>()
  const previewRemovedIds = new Set<string>()
  if (isPreviewTarget) {
    if (assignments.length === 0) {
      previewGhostRange = { start: shiftBounds.start, end: shiftBounds.end }
    } else {
      const plan = planInsertion(
        assignments.map((a: any) => ({ id: a.id, start: new Date(a.startTime), end: new Date(a.endTime) })),
        shiftBounds.start, shiftBounds.end, 60
      )
      previewGhostRange = plan.newSegment
      for (const r of plan.resized) previewResizedById.set(r.id, r)
      for (const id of plan.removed) previewRemovedIds.add(id)
    }
  }

  type PreviewItem =
    | { kind: 'segment'; sortKey: number; assignment: any; start: Date; end: Date }
    | { kind: 'ghost'; sortKey: number; start: Date; end: Date }

  const previewItems: PreviewItem[] = isPreviewTarget
    ? [
      ...assignments
        .filter((a: any) => !previewRemovedIds.has(a.id))
        .map((a: any): PreviewItem => {
          const resized = previewResizedById.get(a.id)
          const start = resized?.start ?? new Date(a.startTime)
          const end = resized?.end ?? new Date(a.endTime)
          return { kind: 'segment', sortKey: start.getTime(), assignment: a, start, end }
        }),
      ...(previewGhostRange
        ? [{ kind: 'ghost' as const, sortKey: previewGhostRange.start.getTime(), start: previewGhostRange.start, end: previewGhostRange.end }]
        : []),
    ].sort((a, b) => a.sortKey - b.sortKey)
    : []

  return (
    <div className="w-full h-full flex flex-col gap-1">
      {isPreviewTarget ? (
        previewItems.map((item) => {
          if (item.kind === 'ghost') {
            return (
              <div
                key="preview-ghost"
                className="transition-all duration-150 ease-out flex flex-col items-center justify-center px-1.5 py-1 rounded border-2 border-dashed border-rose-400 bg-rose-100/70 text-rose-700 text-[11.5px] italic select-none"
              >
                <span className="whitespace-nowrap">{draggingMember!.lastName}, {draggingMember!.firstName.charAt(0)}.</span>
                <span className="text-[8px] opacity-70 font-mono tracking-tighter whitespace-nowrap">{formatNZTime(item.start)}-{formatNZTime(item.end)}</span>
              </div>
            )
          }
          const owner = item.assignment.actualMemberId ? item.assignment.actualMember : item.assignment.member
          const nameFormatted = owner ? `${owner.lastName}, ${owner.firstName.charAt(0)}.` : 'Unknown'
          return (
            <div
              key={item.assignment.id}
              className="transition-all duration-150 ease-out flex flex-col items-center justify-center px-1.5 py-1 rounded border bg-white/70 text-slate-500 border-rose-200 text-[11.5px] select-none"
            >
              <span className="whitespace-nowrap">{nameFormatted}</span>
              <span className="text-[8px] opacity-60 font-mono tracking-tighter whitespace-nowrap">{formatNZTime(item.start)}-{formatNZTime(item.end)}</span>
            </div>
          )
        })
      ) : (
        normalItems.map((item) => {
          if (item.kind === 'gap') {
            return (
              <div
                key={`gap-${item.start.getTime()}`}
                onClick={openPanel}
                className="animate-jiggle flex items-center justify-center px-1.5 py-1 rounded border border-dashed border-rose-300 text-rose-400 text-[10px] italic cursor-pointer select-none"
              >
                Open
              </div>
            )
          }

          const assignment = item.assignment
          const owner = assignment.actualMemberId ? assignment.actualMember : assignment.member
          const nameFormatted = owner ? `${owner.lastName}, ${owner.firstName.charAt(0)}.` : 'Unknown'
          const startStr = formatNZTime(new Date(assignment.startTime))
          const endStr = formatNZTime(new Date(assignment.endTime))

          return (
            <div
              key={assignment.id}
              onPointerDown={(e) => handlePointerDown(e, assignment)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={{ touchAction: 'none' }}
              className="animate-jiggle transition-all duration-150 ease-out flex flex-col items-center justify-center px-1.5 py-1 rounded border bg-white text-slate-800 border-rose-300 text-[11.5px] shadow-sm select-none cursor-grab active:cursor-grabbing"
            >
              <span className="whitespace-nowrap">{nameFormatted}</span>
              <span className="text-[8px] opacity-60 font-mono tracking-tighter whitespace-nowrap">{startStr}-{endStr}</span>
            </div>
          )
        })
      )}
    </div>
  )
}
