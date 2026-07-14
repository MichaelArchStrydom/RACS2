'use client'

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
  return (
    <NavMenuProvider>
      <main className={`min-h-dvh bg-slate-100 p-4 md:p-8 text-slate-900 ${mainClassName}`}>
        <div className={`${widthClass} mx-auto space-y-6`}>
          <header className="bg-white p-4 rounded-xl shadow-sm border flex flex-wrap items-center justify-between gap-4">
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
