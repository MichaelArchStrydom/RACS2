'use client'

import { createContext, useContext, useState } from 'react'

interface PendingClaimSeat {
  dateStr: string // "YYYY-MM-DD" NZ calendar date — the slot may not exist yet
  applianceName: string
  applianceRole: string
  label: string // display string, e.g. "Wed 12 Aug · 1st Due · FF3"
}

interface RosterInteractionContextValue {
  pendingShiftAssignmentId: string | null
  pendingScrollRequestId: string | null
  pendingClaimSeat: PendingClaimSeat | null
  requestCoverFor: (assignmentId: string) => void
  scrollToRequest: (requestId: string) => void
  claimSeat: (seat: PendingClaimSeat) => void
  clearPendingShift: () => void
  clearPendingScroll: () => void
  clearPendingClaim: () => void
}

const RosterInteractionContext = createContext<RosterInteractionContextValue | null>(null)

export function RosterInteractionProvider({ children }: { children: React.ReactNode }) {
  const [pendingShiftAssignmentId, setPendingShiftAssignmentId] = useState<string | null>(null)
  const [pendingScrollRequestId, setPendingScrollRequestId] = useState<string | null>(null)
  const [pendingClaimSeat, setPendingClaimSeat] = useState<PendingClaimSeat | null>(null)

  return (
    <RosterInteractionContext.Provider
      value={{
        pendingShiftAssignmentId,
        pendingScrollRequestId,
        pendingClaimSeat,
        requestCoverFor: (assignmentId) => setPendingShiftAssignmentId(assignmentId),
        scrollToRequest: (requestId) => setPendingScrollRequestId(requestId),
        claimSeat: (seat) => setPendingClaimSeat(seat),
        clearPendingShift: () => setPendingShiftAssignmentId(null),
        clearPendingScroll: () => setPendingScrollRequestId(null),
        clearPendingClaim: () => setPendingClaimSeat(null),
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
