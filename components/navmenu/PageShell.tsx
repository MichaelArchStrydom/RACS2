'use client'

import { useLayoutEffect, useRef } from 'react'
import NavMenuButton from '@/components/navmenu/NavMenuButton'
import NavMenuPanel from '@/components/navmenu/NavMenuPanel'
import { NavMenuProvider } from '@/components/navmenu/NavMenuContext'

interface PageShellProps {
  heading: string
  isAdmin: boolean
  userId: string
  memberName: string
  mainClassName?: string
  widthClass?: string
  children: React.ReactNode
}

export default function PageShell({ heading, isAdmin, userId, memberName, mainClassName = '', widthClass = 'max-w-7xl', children }: PageShellProps) {
  const headerRef = useRef<HTMLElement>(null)

  // On first load, scroll the top bar (and anything opted in via
  // data-scroll-fold, e.g. the announcements preview) out of view so mobile
  // users land straight on the page content instead of losing screen space
  // to the header — they scroll up if they want the nav or announcements.
  useLayoutEffect(() => {
    if (window.scrollY > 0 || !headerRef.current) return
    let foldBottom = headerRef.current.getBoundingClientRect().bottom
    document.querySelectorAll('[data-scroll-fold]').forEach((el) => {
      foldBottom = Math.max(foldBottom, el.getBoundingClientRect().bottom)
    })
    window.scrollTo(0, foldBottom)
  }, [])

  return (
    <NavMenuProvider>
      <main className={`min-h-dvh bg-slate-100 p-4 md:p-8 text-slate-900 ${mainClassName}`}>
        <div className={`${widthClass} mx-auto space-y-6`}>
          <header ref={headerRef} className="bg-white p-4 rounded-xl shadow-sm border flex flex-wrap items-center justify-between gap-4">
            <NavMenuButton />
            <h1 className="text-2xl font-bold text-slate-800">{heading}</h1>
          </header>
          {children}
        </div>
      </main>
      <NavMenuPanel isAdmin={isAdmin} userId={userId} memberName={memberName} />
    </NavMenuProvider>
  )
}
