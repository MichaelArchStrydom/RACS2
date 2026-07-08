'use client'

import { useTransition, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { acceptStandInRequest } from '@/app/actions/rosterActions'

interface StandInRequestItemProps {
  request: any
  activeUserId: string
}

export default function StandInRequestItem({ request, activeUserId }: StandInRequestItemProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Self-detect mobile so the isMobile prop is no longer needed
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    setIsMobile(window.matchMedia('(pointer: coarse)').matches)
  }, [])

  // ── FIX: explicit NZ timezone so times show correctly on Vercel (UTC) ──
  const NZ_OPTS = { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Pacific/Auckland' } as const
  const defaultStart = new Date(request.startTime).toLocaleTimeString("en-NZ", NZ_OPTS)
  const defaultEnd = new Date(request.endTime).toLocaleTimeString("en-NZ", NZ_OPTS)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget as HTMLFormElement)
    const startStr = formData.get('coverStart') as string
    const endStr = formData.get('coverEnd') as string

    startTransition(async () => {
      await acceptStandInRequest(request.id, activeUserId, startStr, endStr)
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
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 bg-slate-50 p-3 rounded-lg border">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-500">Fulfill From:</span>
            <input
              name="coverStart"
              type={isMobile ? "time" : "text"}
              defaultValue={defaultStart}
              className={`bg-white border rounded px-2 font-mono text-xs ${isMobile ? 'py-2 min-w-[130px] text-sm' : 'py-1 w-16 text-center'
                }`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-500">Fulfill Until:</span>
            <input
              name="coverEnd"
              type={isMobile ? "time" : "text"}
              defaultValue={defaultEnd}
              className={`bg-white border rounded px-2 font-mono text-xs ${isMobile ? 'py-2 min-w-[130px] text-sm' : 'py-1 w-16 text-center'
                }`}
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className={`px-4 font-bold rounded shadow-sm transition-colors text-xs disabled:bg-slate-200 disabled:text-slate-400
              ${isOwnRequest
                ? 'bg-rose-500 hover:bg-rose-600 text-white'
                : 'bg-amber-500 hover:bg-amber-600 text-white'}
              ${isMobile ? 'py-2.5 w-full mt-1' : 'py-1.5'}`}
          >
            {isPending ? 'Processing...' : isOwnRequest ? 'Retract Request' : 'Take Shift'}
          </button>
        </form>
      ) : (
        <span className="inline-flex items-center gap-1 text-blue-600 font-semibold bg-blue-50 px-2 py-1 rounded border border-blue-200">
          ✓ Covered by {request.coveredBy?.lastName}
        </span>
      )}
    </div>
  )
}
