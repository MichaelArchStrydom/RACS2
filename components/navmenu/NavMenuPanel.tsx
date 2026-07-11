'use client'

import Link from 'next/link'
import { useNavMenu } from './NavMenuContext'

const navLinks = [
  { href: '/profile', label: 'Profile & Settings', icon: '👤' },
  { href: '/contacts', label: 'Contacts', icon: '📞' },
  { href: '/stats', label: 'Stats', icon: '📊' },
]

export default function NavMenuPanel() {
  const { isOpen, close } = useNavMenu()

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
          <h2 className="text-sm font-bold text-slate-800">Menu</h2>
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
        </nav>
      </aside>
    </>
  )
}
