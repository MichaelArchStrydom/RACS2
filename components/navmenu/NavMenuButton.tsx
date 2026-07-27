'use client'

import { useNavMenu } from './NavMenuContext'
import { Menu } from 'lucide-react'

export default function NavMenuButton() {
  const { toggle } = useNavMenu()

  return (
    <button
      onClick={toggle}
      title="Menu"
      className="px-2.5 py-1.5 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors flex items-center gap-0.5"
    >
      <Menu className="w-7 h-7" />
    </button>
  )
}
