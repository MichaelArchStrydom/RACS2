'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acceptStandInRequest, moderatorCancelStandInRequest } from '@/app/actions/rosterActions'
import { ALREADY_ACTIONED } from '@/lib/errors'
import { formatNZTime, normalizeTimeInput } from '@/lib/timezone'
import Spinner from '@/components/Spinner'

interface StandInRequestItemProps {
  request: any
  activeUserId: string
  // Board-level cancel mode (moderators/admins only): the submit button
  // becomes "Delete Request" and the time inputs define WHICH PORTION of the
  // request to cancel (full window pre-filled = full cancel).
  cancelMode?: boolean
}

export default function StandInRequestItem({ request, activeUserId, cancelMode = false }: StandInRequestItemProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const defaultStart = formatNZTime(request.startTime)
  const defaultEnd = formatNZTime(request.endTime)

  const [coverStart, setCoverStart] = useState(defaultStart)
  const [coverEnd, setCoverEnd] = useState(defaultEnd)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (cancelMode) {
      const dateStr = new Date(request.slot.date).toLocaleDateString('en-NZ', {
        timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      })
      const ok = confirm(
        `Cancel this cover request?\n\n` +
        `${request.requestedBy.firstName} ${request.requestedBy.lastName}\n` +
        `${dateStr} · ${coverStart} – ${coverEnd}\n\n` +
        `The shift stays with them as originally rostered.`
      )
      if (!ok) return
      startTransition(async () => {
        try {
          await moderatorCancelStandInRequest(request.id, coverStart, coverEnd)
          router.refresh()
        } catch (err) {
          setError(
            err instanceof Error && err.message === ALREADY_ACTIONED
              ? 'Someone else just actioned this request — refreshing…'
              : 'Something went wrong — please try again.'
          )
          router.refresh()
        }
      })
      return
    }

    startTransition(async () => {
      try {
        await acceptStandInRequest(request.id, activeUserId, coverStart, coverEnd)
        router.refresh()
      } catch (err) {
        setError(
          err instanceof Error && err.message === ALREADY_ACTIONED
            ? 'Someone else just actioned this request — refreshing…'
            : 'Something went wrong — please try again.'
        )
        router.refresh()
      }
    })
  }

  const isOwnRequest = activeUserId === request.requestedById

  return (
    <div className="p-4 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs border-b last:border-b-0">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800 text-sm">
            {request.requestedBy.lastName}, {request.requestedBy.firstName}
          </span>
          <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase">
            {request.slot.appliance}
          </span>
        </div>
        <p className="text-slate-500 mt-1">
          Shift Date: {new Date(request.slot.date).toLocaleDateString("en-NZ", { weekday: 'short', day: 'numeric', month: 'short' })}
        </p>
        <p className="text-slate-400 font-mono text-[10px] mt-0.5">
          Requested Hours: {defaultStart} – {defaultEnd}
        </p>
      </div>

      {request.status === "PENDING" ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 bg-slate-50 p-3 rounded-lg border w-full md:w-auto">
          {error && (
            <p className="text-[11px] font-semibold text-rose-600">{error}</p>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-slate-500">Fulfill From:</span>
              {/* Desktop: compact free-text entry. Typing just an hour
                  ("7" or "17") and blurring auto-formats to "HH:00". */}
              <input
                type="text"
                value={coverStart}
                onChange={e => setCoverStart(e.target.value)}
                onBlur={e => setCoverStart(normalizeTimeInput(e.target.value))}
                className="hidden md:block bg-white border rounded px-2 py-1 w-16 text-center font-mono text-xs"
              />
              {/* Mobile: native time picker */}
              <input
                type="time"
                value={coverStart}
                onChange={e => setCoverStart(e.target.value)}
                className="md:hidden bg-white border rounded px-2 py-2 min-w-[130px] text-sm font-mono"
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-slate-500">Fulfill Until:</span>
              <input
                type="text"
                value={coverEnd}
                onChange={e => setCoverEnd(e.target.value)}
                onBlur={e => setCoverEnd(normalizeTimeInput(e.target.value))}
                className="hidden md:block bg-white border rounded px-2 py-1 w-16 text-center font-mono text-xs"
              />
              <input
                type="time"
                value={coverEnd}
                onChange={e => setCoverEnd(e.target.value)}
                className="md:hidden bg-white border rounded px-2 py-2 min-w-[130px] text-sm font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className={`flex items-center justify-center gap-1.5 px-4 font-bold rounded shadow-sm transition-colors text-xs disabled:bg-slate-200 disabled:text-slate-400 w-full md:w-auto py-2.5 md:py-1.5
                ${cancelMode
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : isOwnRequest
                    ? 'bg-rose-500 hover:bg-rose-600 text-white'
                    : 'bg-amber-500 hover:bg-amber-600 text-white'}`}
            >
              {isPending && <Spinner className="w-3.5 h-3.5" />}
              {isPending ? 'Processing...' : cancelMode ? '🗑 Delete Request' : isOwnRequest ? 'Retract Request' : 'Take Shift'}
            </button>
          </div>
        </form>
      ) : (
        <span className="inline-flex items-center gap-1 text-blue-600 font-semibold bg-blue-50 px-2 py-1 rounded border border-blue-200">
          ✓ Covered by {request.coveredBy?.lastName}
        </span>
      )}
    </div>
  )
}
