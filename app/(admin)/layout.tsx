'use client' // Marks this component for interactive state toggles

import Link from 'next/link'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'

interface AdminLayoutProps {
  children: React.ReactNode
}

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/members', label: 'Members', icon: '🧑‍🚒' },
  { href: '/admin/crews', label: 'Crews', icon: '👥' },
  { href: '/admin/appliances', label: 'Appliances', icon: '🚒' },
  { href: '/admin/holidays', label: 'Public Holidays', icon: '📅' },
  { href: '/admin/leave', label: 'Leave', icon: '🏖️' },
  { href: '/admin/roster', label: 'Roster Tools', icon: '⚙️' },
]

export default function AdminLayout({ children }: AdminLayoutProps) {
  // Set default state to collapsed (false)
  const [isExpanded, setIsExpanded] = useState(false)

  const searchParams = useSearchParams()
  const userId = searchParams.get('user')
  const userQuery = userId ? `?user=${userId}` : ''

  return (
    <div className="min-h-screen bg-slate-100 flex">
      {/* Sidebar - Dynamic width classes using Tailwind transition configurations */}
      <aside
        className={`bg-slate-900 text-white flex flex-col shrink-0 transition-all duration-300 ease-in-out ${isExpanded ? 'w-56' : 'w-12'
          }`}
      >
        {/* Header Block with Toggle Button */}
        <div className="px-4 py-4 border-b border-slate-700 flex items-center justify-between min-h-16.25">
          {isExpanded && (
            <div className="transition-opacity duration-200">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Admin Panel</p>
              <p className="text-sm font-semibold text-white mt-0.5">RACS2</p>
            </div>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors focus:outline-none ${!isExpanded ? 'mx-auto' : ''
              }`}
            title={isExpanded ? "Collapse Menu" : "Expand Menu"}
          >
            {isExpanded ? '◀' : '▶'}
          </button>
        </div>

        {/* Navigation Area */}
        <nav className="flex-1 py-4 flex flex-col gap-0.5 px-2 overflow-x-hidden">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={`${item.href}${userQuery}`}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors group ${!isExpanded ? 'justify-center' : ''
                }`}
              title={!isExpanded ? item.label : undefined} // Tooltip fallback when minimized
            >
              <span className="text-base shrink-0">{item.icon}</span>
              <span
                className={`transition-all duration-200 whitespace-nowrap ${isExpanded ? 'opacity-100' : 'opacity-0 w-0 pointer-events-none'
                  }`}
              >
                {item.label}
              </span>
            </Link>
          ))}
        </nav>

        {/* Sidebar Footer Link */}
        <div className="px-4 py-4 border-t border-slate-700 flex justify-center">
          <Link
            href={`/${userQuery}`}
            className={`flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors ${!isExpanded ? 'justify-center' : ''
              }`}
            title="Back to Roster Board"
          >
            <span className="shrink-0">←</span>
            <span
              className={`transition-all duration-200 whitespace-nowrap ${isExpanded ? 'opacity-100' : 'opacity-0 w-0 pointer-events-none'
                }`}
            >
              Back to Roster
            </span>
          </Link>
        </div>
      </aside>

      {/* Main content viewport */}
      <main className="
        flex-1 
        overflow-auto 
        p-6 
        md:p-8 
        [&_input]:bg-white 
        [&_input]:text-slate-800 
        [&_input]:placeholder-slate-400
        [&_select]:bg-white 
        [&_select]:text-slate-800
        [&_input::placeholder]:text-slate-800">
        {children}
      </main>
    </div>
  )
}
