'use client'

import { useAnnouncementsPanel } from './AnnouncementsContext'
import { formatNZTime } from '@/lib/timezone'

interface Props {
  latest: { title: string; createdAt: Date | string } | null
  unreadCount: number
}

export default function AnnouncementsPreview({ latest, unreadCount }: Props) {
  const { open } = useAnnouncementsPanel()
  if (!latest) return null

  const dateStr = new Date(latest.createdAt).toLocaleDateString("en-NZ", {
    timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short',
  })

  return (
    <button
      onClick={open}
      className="relative w-full text-left bg-white p-3 rounded-xl shadow-sm border flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base shrink-0">📢</span>
        <span className="text-sm font-semibold text-slate-800 truncate">{latest.title}</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-4.5 h-4.5 flex items-center justify-center px-1">
            {unreadCount}
          </span>
        )}

      </div>
      <span className="text-xs text-slate-400 font-mono shrink-0">
        {dateStr} · {formatNZTime(latest.createdAt as Date)}
      </span>
    </button>
  )
}
