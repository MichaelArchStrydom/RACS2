'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acceptStandInRequest } from '@/app/actions/rosterActions'
import { formatNZTime } from '@/lib/timezone'

interface StandInRequestItemProps {
  request: any
  activeUserId: string
}

export default function StandInRequestItem({ request, activeUserId }: StandInRequestItemProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const defaultStart = formatNZTime(request.startTime)
  const defaultEnd = formatNZTime(request.endTime)

  const [coverStart, setCoverStart] = useState(defaultStart)
  const [coverEnd, setCoverEnd] = useState(defaultEnd)

  // Quick-pick presets for the mobile chips: whole shift, or split at the
  // midpoint. Desktop keeps direct entry, no presets shown.
  const mid = new Date((new Date(request.startTime).getTime() + new Date(request.endTime).getTime()) / 2)
  const presets = {
    whole: { start: defaultStart, end: defaultEnd },
    first: { start: defaultStart, end: formatNZTime(mid) },
    second: { start: formatNZTime(mid), end: defaultEnd },
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      await acceptStandInRequest(request.id, activeUserId, coverStart, coverEnd)
      router.refresh()
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
          {/* Quick-pick presets — mobile only. Desktop keeps direct entry. */}
          <div className="flex md:hidden gap-2">
            <button
              type="button"
              onClick={() => { setCoverStart(presets.whole.start); setCoverEnd(presets.whole.end) }}
              className="flex-1 py-2 text-xs font-semibold rounded-lg border bg-white text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Whole Shift
            </button>
            <button
              type="button"
              onClick={() => { setCoverStart(presets.first.start); setCoverEnd(presets.first.end) }}
              className="flex-1 py-2 text-xs font-semibold rounded-lg border bg-white text-slate-600 hover:bg-slate-100 transition-colors"
            >
              First Half
            </button>
            <button
              type="button"
              onClick={() => { setCoverStart(presets.second.start); setCoverEnd(presets.second.end) }}
              className="flex-1 py-2 text-xs font-semibold rounded-lg border bg-white text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Second Half
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-slate-500">Fulfill From:</span>
              {/* Desktop: compact free-text entry, unchanged */}
              <input
                type="text"
                value={coverStart}
                onChange={e => setCoverStart(e.target.value)}
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
              className={`px-4 font-bold rounded shadow-sm transition-colors text-xs disabled:bg-slate-200 disabled:text-slate-400 w-full md:w-auto py-2.5 md:py-1.5
                ${isOwnRequest
                  ? 'bg-rose-500 hover:bg-rose-600 text-white'
                  : 'bg-amber-500 hover:bg-amber-600 text-white'}`}
            >
              {isPending ? 'Processing...' : isOwnRequest ? 'Retract Request' : 'Take Shift'}
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
