'use client'

import { useAnnouncementsPanel } from './AnnouncementsContext'

export default function AnnouncementsButton({ unreadCount }: { unreadCount: number }) {
  const { toggle } = useAnnouncementsPanel()

  return (
    <button
      onClick={toggle}
      title="Announcements"
      className="relative px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border rounded-lg text-xs font-semibold text-slate-700 transition-colors flex items-center gap-1.5"
    >
      <span>📢</span>
      {unreadCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-4.5 h-4.5 flex items-center justify-center px-1">
          {unreadCount}
        </span>
      )}
    </button>
  )
}
