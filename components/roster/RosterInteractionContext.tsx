'use client'

import { createContext, useContext, useState } from 'react'

interface RosterInteractionContextValue {
  pendingShiftAssignmentId: string | null
  pendingScrollRequestId: string | null
  requestCoverFor: (assignmentId: string) => void
  scrollToRequest: (requestId: string) => void
  clearPendingShift: () => void
  clearPendingScroll: () => void
}

const RosterInteractionContext = createContext<RosterInteractionContextValue | null>(null)

export function RosterInteractionProvider({ children }: { children: React.ReactNode }) {
  const [pendingShiftAssignmentId, setPendingShiftAssignmentId] = useState<string | null>(null)
  const [pendingScrollRequestId, setPendingScrollRequestId] = useState<string | null>(null)

  return (
    <RosterInteractionContext.Provider
      value={{
        pendingShiftAssignmentId,
        pendingScrollRequestId,
        requestCoverFor: (assignmentId) => setPendingShiftAssignmentId(assignmentId),
        scrollToRequest: (requestId) => setPendingScrollRequestId(requestId),
        clearPendingShift: () => setPendingShiftAssignmentId(null),
        clearPendingScroll: () => setPendingScrollRequestId(null),
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
