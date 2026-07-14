'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAnnouncementsPanel } from './AnnouncementsContext'
import {
  markAnnouncementRead,
  markAnnouncementUnread,
  archiveAnnouncement,
  unarchiveAnnouncement,
} from '@/app/actions/announcementActions'
import { formatNZTime } from '@/lib/timezone'
import Spinner from '@/components/Spinner'
import { useBodyScrollLock } from '@/components/useBodyScrollLock'

interface Receipt {
  readAt: Date | string | null
  archivedAt: Date | string | null
}

interface AnnouncementWithReceipt {
  id: string
  title: string
  body: string
  createdAt: Date | string
  receipts: Receipt[]
}

interface Props {
  announcements: AnnouncementWithReceipt[]
  activeUserId: string
}

type ReceiptAction = (memberId: string, announcementId: string) => Promise<void>

export default function AnnouncementsPanel({ announcements, activeUserId }: Props) {
  const { isOpen, close } = useAnnouncementsPanel()
  useBodyScrollLock(isOpen)
  const router = useRouter()
  const [showArchived, setShowArchived] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const isRead = (a: AnnouncementWithReceipt) => a.receipts[0]?.readAt != null
  const isArchived = (a: AnnouncementWithReceipt) => a.receipts[0]?.archivedAt != null

  const visible = announcements.filter((a) => showArchived || !isArchived(a))

  const runAction = (id: string, action: ReceiptAction) => {
    setPendingId(id)
    startTransition(async () => {
      try {
        await action(activeUserId, id)
      } finally {
        setPendingId(null)
        router.refresh()
      }
    })
  }

  return (
    <>
      <div
        onClick={close}
        aria-hidden="true"
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
      />

      <aside
        className={`fixed right-0 top-0 h-full w-[85%] max-w-sm bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
      >
        <div className="p-4 border-b flex items-center justify-between shrink-0">
          <h2 className="text-sm font-bold text-slate-800">Announcements</h2>
          <button onClick={close} className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1">✕</button>
        </div>

        <label className="flex items-center gap-2 text-xs font-medium text-slate-600 px-4 py-2 border-b cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded text-rose-500 focus:ring-rose-500"
          />
          Show Archived
        </label>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {visible.length === 0 ? (
            <p className="text-xs text-slate-400 italic p-4">No announcements to show.</p>
          ) : (
            visible.map((a) => {
              const read = isRead(a)
              const archived = isArchived(a)
              const busy = isPending && pendingId === a.id

              return (
                <div key={a.id} className={`p-4 space-y-2 ${!read ? 'bg-rose-50/60' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-800">{a.title}</h3>
                    {!read && <span className="shrink-0 w-2 h-2 rounded-full bg-rose-500 mt-1.5" />}
                  </div>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap">{a.body}</p>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {new Date(a.createdAt).toLocaleDateString("en-NZ", { timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short' })}
                    {' · '}
                    {formatNZTime(a.createdAt as Date)}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      disabled={busy}
                      onClick={() => runAction(a.id, read ? markAnnouncementUnread : markAnnouncementRead)}
                      className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded border bg-slate-50 hover:bg-slate-100 text-slate-600 disabled:opacity-50"
                    >
                      {busy && <Spinner className="w-3 h-3" />}
                      {read ? 'Mark Unread' : 'Mark Read'}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => runAction(a.id, archived ? unarchiveAnnouncement : archiveAnnouncement)}
                      className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded border bg-slate-50 hover:bg-slate-100 text-slate-600 disabled:opacity-50"
                    >
                      {busy && <Spinner className="w-3 h-3" />}
                      {archived ? 'Unarchive' : 'Archive'}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </aside>
    </>
  )
}
