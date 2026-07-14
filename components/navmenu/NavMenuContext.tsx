'use client'

import { createContext, useContext, useState } from 'react'

interface NavMenuContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const NavMenuContext = createContext<NavMenuContextValue | null>(null)


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
