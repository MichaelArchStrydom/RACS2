'use client'

import Link from 'next/link'
import { useNavMenu } from './NavMenuContext'

interface NavMenuPanelProps {
  isAdmin: boolean
  userId: string
}
export const AdminNavLinks = [
  { href: '/admin', label: 'Admin Dashboard', icon: '🎛️' },
  { href: '/admin/members', label: 'Members', icon: '🧑‍🚒' },
  { href: '/admin/qualifications', label: 'Qualifications', icon: '🎓' },
  { href: '/admin/crews', label: 'Crews', icon: '👥' },
  { href: '/admin/appliances', label: 'Appliances', icon: '🚒' },
  { href: '/admin/holidays', label: 'Public Holidays', icon: '📅' },
  { href: '/admin/announcements', label: 'Announcements', icon: '📢' },
  { href: '/admin/leave', label: 'Leave', icon: '🏖️' },
  { href: '/admin/roster', label: 'Roster Tools', icon: '⚙️' },
]
export default function NavMenuPanel({ isAdmin, userId }: NavMenuPanelProps) {
  const { isOpen, close } = useNavMenu()
  const userQuery = `?user=${userId}`

  const navLinks = [
    { href: '/', label: 'Roster', icon: '🗓️' },
    { href: '/profile', label: 'Profile & Settings', icon: '👤' },
    { href: '/contacts', label: 'Contacts', icon: '📞' },
    { href: '/stats', label: 'Stats', icon: '📊' },
  ]

  return (
    <>
      {/* Backdrop — the visible sliver of roster on the right is just this
          transparent layer; clicking it closes the panel. */}
      <div
        onClick={close}
        aria-hidden="true"
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
      />

      <aside
        className={`fixed left-0 top-0 h-full w-[85%] max-w-xs bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="p-4 border-b flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-slate-800">RACS 2</h2>
          <button onClick={close} className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1">✕</button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {navLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={close}
              className="flex items-start gap-3 px-3 py-3 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <span className="text-lg shrink-0">{item.icon}</span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-slate-800">{item.label}</span>
              </span>
            </Link>
          ))}
          {isAdmin && (
            <>
              <div className="p-0 border border-amber-700 bg-amber-200 rounded-lg">
                {AdminNavLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={`${item.href}${userQuery}`}
                    onClick={close}
                    className="flex items-start gap-3 px-3 py-3 rounded-lg hover:bg-amber-500 transition-colors"
                  >
                    <span className="text-lg shrink-0">{item.icon}</span>
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-800">{item.label}</span>
                    </span>
                  </Link>
                ))}
              </div>


            </>
          )}
        </nav>
      </aside>
    </>
  )
}
