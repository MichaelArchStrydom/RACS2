'use client'

import Link from 'next/link'
import { useNavMenu } from './NavMenuContext'
import { logoutAction } from '@/app/actions/authActions'
import { useBodyScrollLock } from '@/components/useBodyScrollLock'

interface NavMenuPanelProps {
  isAdmin: boolean
  userId: string
  memberName: string
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
export default function NavMenuPanel({ isAdmin, userId, memberName }: NavMenuPanelProps) {
  const { isOpen, close } = useNavMenu()
  useBodyScrollLock(isOpen)
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

        <div className="p-4 border-b bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Logged In As</span>
            <span className="text-sm font-bold text-slate-700">{memberName}</span>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-100 px-2 py-1 rounded transition-colors border border-transparent hover:border-rose-200"
            >
              Sign Out
            </button>
          </form>
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
              <div className="my-2 border-t border-slate-100" />
              {AdminNavLinks.map((item) => (
                <Link
                  key={item.href}
                  href={`${item.href}${userQuery}`}
                  onClick={close}
                  className="flex items-start gap-3 px-3 py-3 rounded-lg hover:bg-amber-50 transition-colors"
                >
                  <span className="text-lg shrink-0">{item.icon}</span>
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-800">{item.label}</span>
                  </span>
                </Link>
              ))}
            </>
          )}
        </nav>
      </aside>
    </>
  )
}
