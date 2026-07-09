'use client'

import { useAnnouncementsPanel } from './AnnouncementsContext'
import { formatNZTime } from '@/lib/timezone'

interface Props {
  latest: { title: string; createdAt: Date | string } | null
}

export default function AnnouncementsPreview({ latest }: Props) {
  const { open } = useAnnouncementsPanel()
  if (!latest) return null

  const dateStr = new Date(latest.createdAt).toLocaleDateString("en-NZ", {
    timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short',
  })

  return (
    <button
      onClick={open}
      className="w-full text-left bg-white p-3 rounded-xl shadow-sm border flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base shrink-0">📢</span>
        <span className="text-sm font-semibold text-slate-800 truncate">{latest.title}</span>
      </div>
      <span className="text-xs text-slate-400 font-mono shrink-0">
        {dateStr} · {formatNZTime(latest.createdAt as Date)}
      </span>
    </button>
  )
}
