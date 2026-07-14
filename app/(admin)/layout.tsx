'use client'
import { useState, Suspense } from 'react'
import NavMenuButton from '@/components/navmenu/NavMenuButton'
import { NavMenuProvider } from '@/components/navmenu/NavMenuContext'
import { usePathname } from 'next/navigation'
import { AdminNavLinks } from '@/components/navmenu/NavMenuPanel'
import NavMenuPanel from '@/components/navmenu/NavMenuPanel'

interface AdminLayoutProps {
  children: React.ReactNode
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const pathname = usePathname()
  const current = AdminNavLinks.find(item => pathname === item.href || pathname.startsWith(item.href + '/'))
  const heading = current?.label ?? 'Admin'
  return (
    <NavMenuProvider>
      <div className="h-screen bg-slate-100 flex">
        <main className="flex-1 overflow-auto p-6 md:p-8 [&_input]:bg-white [&_input]:text-slate-800 [&_input]:placeholder-slate-400 [&_select]:bg-white [&_select]:text-slate-800 [&_input::placeholder]:text-slate-800">
          <div className="space-y-8 max-w-5xl">
            <div className="space-y-8">
              <header className="bg-white p-4 rounded-xl shadow-sm border flex flex-wrap items-center justify-between gap-4">
                <NavMenuButton />
                <h1 className="text-2xl font-bold text-slate-800">{heading}</h1>
              </header>
              {children}
            </div>
          </div>
        </main>
      </div>
      <NavMenuPanel isAdmin />
    </NavMenuProvider>
  )
}
