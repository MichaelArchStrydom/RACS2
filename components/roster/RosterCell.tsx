'use client'

import { createStandInRequest, acceptStandInRequest } from '@/app/actions/rosterActions'
import { useTransition, useState, useEffect } from 'react'

interface RosterCellProps {
  assignments: any[];
  slotRequests: any[];
  activeUserId: string;
}

export default function RosterCell({ assignments = [], slotRequests = [], activeUserId }: RosterCellProps) {
  const [isPending, startTransition] = useTransition()
  const [showTimePicker, setShowTimePicker] = useState<string | null>(null)

  // ── Mobile detection ─────────────────────────────────────────────────────
  // pointer: coarse reliably detects touch screens (phones/tablets) regardless
  // of screen width. Runs after mount to avoid SSR hydration mismatch.
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    setIsMobile(window.matchMedia('(pointer: coarse)').matches)
  }, [])

  const sortedAssignments = [...assignments].sort((a, b) =>
    new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  )

  return (
    <div className="w-full h-full flex flex-col gap-1">
      {sortedAssignments.map((assignment) => {
        const isCovered = !!assignment.actualMember;

        const assignmentStart = new Date(assignment.startTime).getTime()
        const assignmentEnd = new Date(assignment.endTime).getTime()

        const isRequested = slotRequests.some(r => {
          if (r.requestedById !== assignment.memberId || r.status !== 'PENDING') return false
          const reqStart = new Date(r.startTime).getTime()
          const reqEnd = new Date(r.endTime).getTime()
          return reqStart < assignmentEnd && reqEnd > assignmentStart
        })

        const activeMember = isCovered ? assignment.actualMember : assignment.member;
        const nameFormatted = `${activeMember.lastName}, ${activeMember.firstName.charAt(0)}.`;

        // always display in NZ timezone so SSR (Vercel/UTC) and the
        // client browser produce identical strings, eliminating hydration
        // mismatches and the "5:30–19:00" symptom caused by UTC rendering.
        const NZ_OPTS = { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Pacific/Auckland' } as const
        const startStr = new Date(assignment.startTime).toLocaleTimeString("en-NZ", NZ_OPTS)
        const endStr = new Date(assignment.endTime).toLocaleTimeString("en-NZ", NZ_OPTS)

        let cellStyles = "bg-white text-slate-800 border-slate-200"
        if (isRequested) {
          cellStyles = "bg-yellow-100 text-yellow-900 border-yellow-300 font-medium animate-pulse-subtle"
        } else if (isCovered) {
          cellStyles = "bg-blue-100 text-blue-900 border-blue-300 font-bold"
        }
        if (activeMember.id === activeUserId && !isPending && !isRequested) {
          cellStyles = "bg-green-200 text-green-900 border-green-300 font-medium"
        }
        if (activeMember.id === activeUserId && isRequested) {
          cellStyles = "bg-red-200 text-red-900 border-red-300 font-medium"
        }

        const isActiveMember = activeMember.id === activeUserId
        const currentRequest = slotRequests.find(r => r.status === 'PENDING' && r.requestedById === assignment.memberId);

        // ── Shared time input style helpers ──────────────────────────────────
        // Desktop: compact text inputs that fit inside the small hover overlay
        // Mobile:  native time-picker inputs (type="time") — shows the OS time
        //          wheel; wider to accommodate the picker chrome
        const timeInputClass = isMobile
          ? "flex-1 bg-slate-700 text-white border border-slate-500 rounded px-2 py-2 text-sm"
          : "w-10 bg-slate-800 text-center border border-slate-600 rounded py-0.5 text-white"

        return (
          <div
            key={assignment.id}
            className={`group relative flex flex-col justify-center px-1.5 py-1 rounded border text-[11px] transition-all shadow-sm ${cellStyles}`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="truncate">{nameFormatted}</span>
              <span className="text-[8px] opacity-60 font-mono tracking-tighter">{startStr}-{endStr}</span>
            </div>

            {/* FORM 1: REQUEST COVER */}
            {!isRequested && isActiveMember && (
              <div className="absolute inset-0 bg-slate-900/95 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                {showTimePicker !== assignment.id ? (
                  <button
                    onClick={() => setShowTimePicker(assignment.id)}
                    className="w-full h-full text-[10px] font-bold tracking-wide"
                  >
                    ⚠️ Request Cover
                  </button>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const formData = new FormData(e.currentTarget)
                      const s = formData.get('start') as string
                      const ed = formData.get('end') as string

                      startTransition(async () => {
                        // Time strings are NZ local time (from display). The server
                        // action interprets them as NZ time via setNZHours().
                        // For the createStandInRequest path, computation stays
                        // client-side where setHours() uses the browser's NZ timezone.
                        const targetStart = new Date(assignment.startTime)
                        const [sh, sm] = s.split(':').map(Number)
                        targetStart.setHours(sh, sm, 0, 0)

                        const targetEnd = new Date(assignment.startTime)
                        const [eh, em] = ed.split(':').map(Number)
                        targetEnd.setHours(eh, em, 0, 0)
                        if (targetEnd.getTime() <= targetStart.getTime()) {
                          targetEnd.setDate(targetEnd.getDate() + 1)
                        }

                        await createStandInRequest(assignment.id, assignment.memberId, targetStart, targetEnd)
                        setShowTimePicker(null)
                      })
                    }}
                    className={`w-full flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between gap-1'} text-[9px]`}
                  >
                    {isMobile ? (
                      <>
                        <div className="flex gap-2">
                          <div className="flex flex-col gap-0.5 flex-1">
                            <span className="text-[10px] text-slate-400">From</span>
                            <input name="start" type="time" defaultValue={startStr} className={timeInputClass} />
                          </div>
                          <div className="flex flex-col gap-0.5 flex-1">
                            <span className="text-[10px] text-slate-400">Until</span>
                            <input name="end" type="time" defaultValue={endStr} className={timeInputClass} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button type="submit" className="flex-1 bg-amber-500 py-2 rounded font-bold text-slate-950 text-xs">Post</button>
                          <button type="button" onClick={() => setShowTimePicker(null)} className="flex-1 bg-slate-700 py-2 rounded text-xs">Cancel</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <input name="start" type="text" defaultValue={startStr} className={timeInputClass} />
                        <input name="end" type="text" defaultValue={endStr} className={timeInputClass} />
                        <button type="submit" className="bg-amber-500 px-1.5 rounded font-bold text-slate-950">Go</button>
                        <button type="button" onClick={() => setShowTimePicker(null)} className="bg-slate-700 px-1 rounded">X</button>
                      </>
                    )}
                  </form>
                )}
              </div>
            )}

            {/* FORM 2: PICK UP COVER */}
            {isRequested && currentRequest && !isActiveMember && (
              <div className="absolute inset-0 bg-slate-900/95 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                {showTimePicker !== assignment.id ? (
                  <button
                    onClick={() => setShowTimePicker(assignment.id)}
                    className="w-full h-full text-[10px] font-bold tracking-wide"
                  >
                    ✅ Pick Up Cover
                  </button>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const formData = new FormData(e.currentTarget)
                      const startStrInput = formData.get('coverStart') as string
                      const endStrInput = formData.get('coverEnd') as string
                      startTransition(async () => {
                        await acceptStandInRequest(currentRequest.id, activeUserId, startStrInput, endStrInput)
                        setShowTimePicker(null)
                      })
                    }}
                    className={`w-full flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between gap-1'} text-[9px]`}
                  >
                    {isMobile ? (
                      <>
                        <div className="flex gap-2">
                          <div className="flex flex-col gap-0.5 flex-1">
                            <span className="text-[10px] text-slate-400">From</span>
                            <input name="coverStart" type="time" defaultValue={startStr} className={timeInputClass} />
                          </div>
                          <div className="flex flex-col gap-0.5 flex-1">
                            <span className="text-[10px] text-slate-400">Until</span>
                            <input name="coverEnd" type="time" defaultValue={endStr} className={timeInputClass} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button type="submit" className="flex-1 bg-amber-500 py-2 rounded font-bold text-slate-950 text-xs">Confirm Cover</button>
                          <button type="button" onClick={() => setShowTimePicker(null)} className="flex-1 bg-slate-700 py-2 rounded text-xs">Cancel</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <input name="coverStart" type="text" defaultValue={startStr} className={timeInputClass} />
                        <input name="coverEnd" type="text" defaultValue={endStr} className={timeInputClass} />
                        <button type="submit" className="bg-amber-500 px-1.5 rounded font-bold text-slate-950">Go</button>
                        <button type="button" onClick={() => setShowTimePicker(null)} className="bg-slate-700 px-1 rounded">X</button>
                      </>
                    )}
                  </form>
                )}
              </div>
            )}

            {/* FORM 3: RETRACT COVER */}
            {isRequested && currentRequest && isActiveMember && (
              <div className="absolute inset-0 bg-slate-900/95 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                {showTimePicker !== assignment.id ? (
                  <button
                    onClick={() => setShowTimePicker(assignment.id)}
                    className="w-full h-full text-[10px] font-bold tracking-wide"
                  >
                    ✅ Retract Cover
                  </button>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const formData = new FormData(e.currentTarget)
                      const startStrInput = formData.get('coverStart') as string
                      const endStrInput = formData.get('coverEnd') as string
                      startTransition(async () => {
                        await acceptStandInRequest(currentRequest.id, activeUserId, startStrInput, endStrInput)
                        setShowTimePicker(null)
                      })
                    }}
                    className={`w-full flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between gap-1'} text-[9px]`}
                  >
                    {isMobile ? (
                      <>
                        <div className="flex gap-2">
                          <div className="flex flex-col gap-0.5 flex-1">
                            <span className="text-[10px] text-slate-400">From</span>
                            <input name="coverStart" type="time" defaultValue={startStr} className={timeInputClass} />
                          </div>
                          <div className="flex flex-col gap-0.5 flex-1">
                            <span className="text-[10px] text-slate-400">Until</span>
                            <input name="coverEnd" type="time" defaultValue={endStr} className={timeInputClass} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button type="submit" className="flex-1 bg-rose-600 py-2 rounded font-bold text-white text-xs">Retract</button>
                          <button type="button" onClick={() => setShowTimePicker(null)} className="flex-1 bg-slate-700 py-2 rounded text-xs">Cancel</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <input name="coverStart" type="text" defaultValue={startStr} className={timeInputClass} />
                        <input name="coverEnd" type="text" defaultValue={endStr} className={timeInputClass} />
                        <button type="submit" className="bg-amber-500 px-1.5 rounded font-bold text-slate-950">Go</button>
                        <button type="button" onClick={() => setShowTimePicker(null)} className="bg-slate-700 px-1 rounded">X</button>
                      </>
                    )}
                  </form>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
