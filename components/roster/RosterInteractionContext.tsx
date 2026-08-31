'use client'

import { createContext, useContext, useState } from 'react'
import { planInsertion } from '@/lib/timelineInsert'

export interface DraftAssignment {
  id: string
  memberId: string
  member: { id: string; firstName: string; lastName: string } | null
  actualMemberId: string | null
  actualMember: { id: string; firstName: string; lastName: string } | null
  startTime: Date
  endTime: Date
}

export interface DragMemberInfo {
  id: string
  firstName: string
  lastName: string
}

export interface MoveTarget {
  dateStr: string
  applianceName: string
  applianceRole: string
  shiftStart: Date
  shiftEnd: Date
}

export function cellKeyStr(k: { dateStr: string; applianceName: string; applianceRole: string }): string {
  return `${k.dateStr}|${k.applianceName}|${k.applianceRole}`
}

interface PendingClaimSeat {
  dateStr: string // "YYYY-MM-DD" NZ calendar date — the slot may not exist yet
  applianceName: string
  applianceRole: string
  label: string // display string, e.g. "Wed 12 Aug · 1st Due · FF3"
  rangeStartStr?: string
  rangeEndStr?: string
}

interface PendingEditSeat {
  dateStr: string
  applianceName: string
  applianceRole: string
  label: string
  assignments: any[]
  shiftBounds: { start: Date; end: Date }
}

interface RosterInteractionContextValue {
  pendingShiftAssignmentId: string | null
  pendingShiftRange: { start: Date; end: Date } | null
  pendingScrollRequestId: string | null
  pendingClaimSeat: PendingClaimSeat | null
  isEditMode: boolean
  pendingEditSeat: PendingEditSeat | null
  editDraft: Record<string, DraftAssignment[]> | null
  dirtyKeys: Set<string>
  dragSourceKey: string | null
  dragHoverKey: string | null
  draggingMember: DragMemberInfo | null
  requestCoverFor: (assignmentId: string, range?: { start: Date; end: Date }) => void
  scrollToRequest: (requestId: string) => void
  claimSeat: (seat: PendingClaimSeat) => void
  toggleEditMode: () => void
  exitEditMode: () => void
  openEditPanel: (seat: PendingEditSeat) => void
  clearPendingShift: () => void
  clearPendingScroll: () => void
  clearPendingClaim: () => void
  clearPendingEditSeat: () => void
  initEditDraft: (initial: Record<string, DraftAssignment[]>) => void
  setDragState: (sourceKey: string | null, hoverKey: string | null, member: DragMemberInfo | null) => void
  applyCellMove: (sourceKey: string, target: MoveTarget, member: DragMemberInfo) => void
  setCellDraft: (cellKey: string, assignments: DraftAssignment[]) => void
}

const RosterInteractionContext = createContext<RosterInteractionContextValue | null>(null)

export function RosterInteractionProvider({ children }: { children: React.ReactNode }) {
  const [pendingShiftAssignmentId, setPendingShiftAssignmentId] = useState<string | null>(null)
  const [pendingShiftRange, setPendingShiftRange] = useState<{ start: Date; end: Date } | null>(null)
  const [pendingScrollRequestId, setPendingScrollRequestId] = useState<string | null>(null)
  const [pendingClaimSeat, setPendingClaimSeat] = useState<PendingClaimSeat | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [pendingEditSeat, setPendingEditSeat] = useState<PendingEditSeat | null>(null)
  const [editDraft, setEditDraft] = useState<Record<string, DraftAssignment[]> | null>(null)
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())
  const [dragSourceKey, setDragSourceKey] = useState<string | null>(null)
  const [dragHoverKey, setDragHoverKey] = useState<string | null>(null)
  const [draggingMember, setDraggingMember] = useState<DragMemberInfo | null>(null)

  function applyCellMove(sourceKey: string, target: MoveTarget, member: DragMemberInfo) {
    const targetKey = cellKeyStr(target)
    setEditDraft((prev) => {
      if (!prev) return prev
      const next = { ...prev }
      next[sourceKey] = (next[sourceKey] ?? []).filter((a) => a.memberId !== member.id)

      const targetList = next[targetKey] ?? []
      const newEntry: DraftAssignment = {
        id: `draft-${member.id}-${Date.now()}`,
        memberId: member.id,
        member: { id: member.id, firstName: member.firstName, lastName: member.lastName },
        actualMemberId: null,
        actualMember: null,
        startTime: target.shiftStart,
        endTime: target.shiftEnd,
      }

      if (targetList.length === 0) {
        next[targetKey] = [newEntry]
      } else {
        const plan = planInsertion(
          targetList.map((a) => ({ id: a.id, start: a.startTime, end: a.endTime })),
          target.shiftStart, target.shiftEnd, 60
        )
        const resizedById = new Map(plan.resized.map((r) => [r.id, r]))
        const kept = targetList
          .filter((a) => !plan.removed.includes(a.id))
          .map((a) => (resizedById.has(a.id) ? { ...a, startTime: resizedById.get(a.id)!.start, endTime: resizedById.get(a.id)!.end } : a))
        next[targetKey] = [...kept, { ...newEntry, startTime: plan.newSegment.start, endTime: plan.newSegment.end }]
      }
      return next
    })
    setDirtyKeys((prev) => {
      const next = new Set(prev)
      next.add(sourceKey)
      next.add(targetKey)
      return next
    })
  }

  function setCellDraft(cellKey: string, assignments: DraftAssignment[]) {
    setEditDraft((prev) => (prev ? { ...prev, [cellKey]: assignments } : prev))
    setDirtyKeys((prev) => new Set(prev).add(cellKey))
  }

  function exitEditMode() {
    setIsEditMode(false)
    setEditDraft(null)
    setDirtyKeys(new Set())
    setDragSourceKey(null)
    setDragHoverKey(null)
    setDraggingMember(null)
    setPendingEditSeat(null)
  }

  return (
    <RosterInteractionContext.Provider
      value={{
        pendingShiftAssignmentId,
        pendingShiftRange,
        pendingScrollRequestId,
        pendingClaimSeat,
        isEditMode,
        pendingEditSeat,
        editDraft,
        dirtyKeys,
        dragSourceKey,
        dragHoverKey,
        draggingMember,
        requestCoverFor: (assignmentId, range) => { setPendingShiftAssignmentId(assignmentId); setPendingShiftRange(range ?? null) },
        scrollToRequest: (requestId) => setPendingScrollRequestId(requestId),
        claimSeat: (seat) => setPendingClaimSeat(seat),
        toggleEditMode: () => setIsEditMode((v) => !v),
        exitEditMode,
        openEditPanel: (seat) => setPendingEditSeat(seat),
        clearPendingShift: () => { setPendingShiftAssignmentId(null); setPendingShiftRange(null) },
        clearPendingScroll: () => setPendingScrollRequestId(null),
        clearPendingClaim: () => setPendingClaimSeat(null),
        clearPendingEditSeat: () => setPendingEditSeat(null),
        initEditDraft: (initial) => setEditDraft((prev) => prev ?? initial),
        setDragState: (sourceKey, hoverKey, member) => {
          setDragSourceKey(sourceKey)
          setDragHoverKey(hoverKey)
          setDraggingMember(member)
        },
        applyCellMove,
        setCellDraft,
      }}
    >
      {children}
    </RosterInteractionContext.Provider>
  )
}

export function useRosterInteraction() {
  const ctx = useContext(RosterInteractionContext)
  if (!ctx) throw new Error('useRosterInteraction must be used within RosterInteractionProvider')
  return ctx
}
