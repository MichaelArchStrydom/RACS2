'use client'

import { useNavMenu } from './NavMenuContext'

export default function NavMenuButton() {
  const { toggle } = useNavMenu()

  return (
    <button
      onClick={toggle}
      title="Menu"
      className="px-2.5 py-1 hover:bg-slate-200 rounded-lg text-4xl font-semibold text-slate-700 transition-colors flex items-center gap-0.5"
    >
      <span>☰</span>
    </button>
  )
}
