'use client'

import { createContext, useContext, useState } from 'react'

interface AnnouncementsContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const AnnouncementsContext = createContext<AnnouncementsContextValue | null>(null)

/**
 * Shared open/closed state for the announcements slide-over panel. The
 * toggle button (in the header) and the preview cell (a separate block
 * below it) both need to open the same panel — this context is what lets
 * them do that without prop-drilling state between unrelated siblings.
 */
export function AnnouncementsProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <AnnouncementsContext.Provider
      value={{
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        toggle: () => setIsOpen((v) => !v),
      }}
    >
      {children}
    </AnnouncementsContext.Provider>
  )
}

export function useAnnouncementsPanel() {
  const ctx = useContext(AnnouncementsContext)
  if (!ctx) throw new Error('useAnnouncementsPanel must be used within AnnouncementsProvider')
  return ctx
}
