'use client'

import { createContext, useContext, useState } from 'react'

interface NavMenuContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const NavMenuContext = createContext<NavMenuContextValue | null>(null)

/**
 * Shared open/closed state for the navigation slide-over, same pattern as
 * AnnouncementsContext — the toolbar button and the panel are separate
 * components that both need to read/toggle the same piece of UI state.
 */
export function NavMenuProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <NavMenuContext.Provider
      value={{
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        toggle: () => setIsOpen((v) => !v),
      }}
    >
      {children}
    </NavMenuContext.Provider>
  )
}

export function useNavMenu() {
  const ctx = useContext(NavMenuContext)
  if (!ctx) throw new Error('useNavMenu must be used within NavMenuProvider')
  return ctx
}

export function navAdmin(navLinks) {
  return navLinks
}
