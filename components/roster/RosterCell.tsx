'use client'

import { createStandInRequest, acceptStandInRequest } from '@/app/actions/rosterActions'
import { ALREADY_ACTIONED } from '@/lib/errors'
import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import Spinner from '@/components/Spinner'
import { useRosterInteraction } from './RosterInteractionContext'


interface RosterCellProps {
  assignments: any[];
  slotRequests: any[];
  activeUserId: string;
}

export default function RosterCell({ assignments = [], slotRequests = [], activeUserId }: RosterCellProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showTimePicker, setShowTimePicker] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { requestCoverFor, scrollToRequest } = useRosterInteraction()

  function getStatus(assignment: any) {
    const isCovered = !!assignment.actualMember
    const start = new Date(assignment.startTime).getTime()
    const end = new Date(assignment.endTime).getTime()
    const isRequested = slotRequests.some(r => {
      if (r.requestedById !== assignment.memberId || r.status !== 'PENDING') return false
      const reqStart = new Date(r.startTime).getTime()
      const reqEnd = new Date(r.endTime).getTime()
      return reqStart < end && reqEnd > start
    })
    return { isCovered, isRequested }
  }

  function mergeAdjacent(list: any[]): any[] {
    const byStart = [...list].sort((a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    )
    return byStart.reduce<any[]>((acc, current) => {
      const currentOwner = current.actualMemberId ?? current.memberId
      const last = acc[acc.length - 1]

      const sameOwner = last && (last.actualMemberId ?? last.memberId) === currentOwner
      const isContiguous = last && new Date(last.endTime).getTime() === new Date(current.startTime).getTime()

      const currentStatus = getStatus(current)
      const lastStatus = last ? getStatus(last) : null
      const sameStatus = lastStatus
        ? lastStatus.isCovered === currentStatus.isCovered && lastStatus.isRequested === currentStatus.isRequested
        : false

      if (sameOwner && isContiguous && sameStatus) {
        last.endTime = current.endTime
      } else {
        acc.push({ ...current })
      }

      return acc
    }, [] as any[])
  }

  const sortedAssignments = mergeAdjacent(assignments)


  function splitByRequests(assignment: any): any[] {
    const assignStart = new Date(assignment.startTime).getTime()
    const assignEnd = new Date(assignment.endTime).getTime()

    const overlapping = slotRequests.filter(r =>
      r.status === 'PENDING' &&
      r.requestedById === assignment.memberId &&
      new Date(r.startTime).getTime() < assignEnd &&
      new Date(r.endTime).getTime() > assignStart
    )
    if (overlapping.length === 0) return [assignment]

    const points = new Set<number>([assignStart, assignEnd])
    overlapping.forEach(r => {
      points.add(Math.max(assignStart, new Date(r.startTime).getTime()))
      points.add(Math.min(assignEnd, new Date(r.endTime).getTime()))
    })
    const sortedPoints = [...points].sort((a, b) => a - b)

    const pieces: any[] = []
    for (let i = 0; i < sortedPoints.length - 1; i++) {
      const pieceStart = sortedPoints[i]
      const pieceEnd = sortedPoints[i + 1]
      if (pieceStart >= pieceEnd) continue

      const matchedRequest = overlapping.find(r =>
        new Date(r.startTime).getTime() <= pieceStart && new Date(r.endTime).getTime() >= pieceEnd
      ) ?? null

      pieces.push({
        ...assignment,
        startTime: new Date(pieceStart),
        endTime: new Date(pieceEnd),
        _matchedRequest: matchedRequest,
      })
    }
    return pieces
  }

  const splitSlices = sortedAssignments.flatMap(splitByRequests)
  const displaySlices = mergeAdjacent(splitSlices)

  return (
    <div className="w-full h-full flex flex-col gap-1">
      {displaySlices.map((assignment) => {
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

        const startStr = new Date(assignment.startTime).toLocaleTimeString("en-NZ", { timeZone: 'Pacific/Auckland', hour: "2-digit", minute: "2-digit", hour12: false });
        const endStr = new Date(assignment.endTime).toLocaleTimeString("en-NZ", { timeZone: 'Pacific/Auckland', hour: "2-digit", minute: "2-digit", hour12: false });

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
        const currentRequest = assignment._matchedRequest ?? null

        const closePicker = () => {
          setShowTimePicker(null)
          setError(null)
        }

        const handleCellTap = () => {
          if (!window.matchMedia('(pointer: coarse)').matches) return
          if (isRequested && currentRequest) {
            scrollToRequest(currentRequest.id)
          } else if (isActiveMember && !isRequested) {
            requestCoverFor(assignment.id)
          }
        }

        return (
          <div
            key={`${assignment.id}-${assignment.startTime}`}
            onClick={handleCellTap}
            className={`group relative flex flex-col justify-center px-1.5 py-1 rounded border text-[11px] transition-all shadow-sm ${cellStyles}`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="truncate">{nameFormatted}</span>
              <span className="text-[8px] opacity-60 font-mono tracking-tighter">{startStr}-{endStr}</span>
            </div>

            {/* FORM 1: REQUEST COVER */}
            {!isRequested && isActiveMember && (
              <div className="absolute inset-0 bg-slate-900/95 text-white rounded p-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity flex flex-col items-center justify-center gap-1 z-10">
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
                      setError(null)

                      startTransition(async () => {
                        // Times are NZ local (from display); this runs in the
                        // browser so setHours() uses the browser's own
                        // timezone, which for NZ-based crew is NZ time.
                        const targetStart = new Date(assignment.startTime)
                        const [sh, sm] = s.split(':').map(Number)
                        targetStart.setHours(sh, sm, 0, 0)

                        const targetEnd = new Date(assignment.startTime)
                        const [eh, em] = ed.split(':').map(Number)
                        targetEnd.setHours(eh, em, 0, 0)
                        if (targetEnd.getTime() <= targetStart.getTime()) {
                          targetEnd.setDate(targetEnd.getDate() + 1)
                        }

                        try {
                          await createStandInRequest(assignment.id, assignment.memberId, targetStart, targetEnd)
                          setShowTimePicker(null)
                        } catch {
                          setError('Something went wrong — please try again.')
                          router.refresh()
                        }
                      })
                    }}
                    className="w-full flex items-center justify-between gap-1 text-[9px]"
                  >
                    <input name="start" defaultValue={startStr} disabled={isPending} className="w-10 bg-slate-800 text-center border border-slate-600 rounded py-0.5 text-white disabled:opacity-50" />
                    <input name="end" defaultValue={endStr} disabled={isPending} className="w-10 bg-slate-800 text-center border border-slate-600 rounded py-0.5 text-white disabled:opacity-50" />
                    <button type="submit" disabled={isPending} className="flex items-center justify-center gap-1 bg-amber-500 px-1.5 rounded font-bold text-slate-950 disabled:opacity-60">
                      {isPending ? <Spinner className="w-2.5 h-2.5" /> : 'Go'}
                    </button>
                    <button type="button" disabled={isPending} onClick={closePicker} className="bg-slate-700 px-1 rounded disabled:opacity-50">X</button>
                  </form>
                )}
                {error && showTimePicker === assignment.id && (
                  <p className="text-[8px] font-semibold text-rose-300 text-center px-1">{error}</p>
                )}
              </div>
            )}

            {/* FORM 2: PICK UP COVER */}
            {isRequested && currentRequest && !isActiveMember && (
              <div className="absolute inset-0 bg-slate-900/95 text-white rounded p-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity flex flex-col items-center justify-center gap-1 z-10">
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
                      setError(null)
                      startTransition(async () => {
                        try {
                          await acceptStandInRequest(currentRequest.id, activeUserId, startStrInput, endStrInput)
                          setShowTimePicker(null)
                        } catch (err) {
                          setError(
                            err instanceof Error && err.message === ALREADY_ACTIONED
                              ? 'Someone else just took this — refreshing…'
                              : 'Something went wrong — please try again.'
                          )
                          router.refresh()
                        }
                      })
                    }}
                    className="w-full flex items-center justify-between gap-1 text-[9px]"
                  >
                    <input name="coverStart" defaultValue={startStr} disabled={isPending} className="w-10 bg-slate-800 text-center border border-slate-600 rounded py-0.5 text-white disabled:opacity-50" />
                    <input name="coverEnd" defaultValue={endStr} disabled={isPending} className="w-10 bg-slate-800 text-center border border-slate-600 rounded py-0.5 text-white disabled:opacity-50" />
                    <button type="submit" disabled={isPending} className="flex items-center justify-center gap-1 bg-amber-500 px-1.5 rounded font-bold text-slate-950 disabled:opacity-60">
                      {isPending ? <Spinner className="w-2.5 h-2.5" /> : 'Go'}
                    </button>
                    <button type="button" disabled={isPending} onClick={closePicker} className="bg-slate-700 px-1 rounded disabled:opacity-50">X</button>
                  </form>
                )}
                {error && showTimePicker === assignment.id && (
                  <p className="text-[8px] font-semibold text-rose-300 text-center px-1">{error}</p>
                )}
              </div>
            )}

            {/* FORM 3: RETRACT COVER FOR YOURSELF */}
            {isRequested && currentRequest && isActiveMember && (
              <div className="absolute inset-0 bg-slate-900/95 text-white rounded p-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity flex flex-col items-center justify-center gap-1 z-10">
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
                      setError(null)
                      startTransition(async () => {
                        try {
                          await acceptStandInRequest(currentRequest.id, activeUserId, startStrInput, endStrInput)
                          setShowTimePicker(null)
                        } catch (err) {
                          setError(
                            err instanceof Error && err.message === ALREADY_ACTIONED
                              ? 'Someone else just actioned this — refreshing…'
                              : 'Something went wrong — please try again.'
                          )
                          router.refresh()
                        }
                      })
                    }}
                    className="w-full flex items-center justify-between gap-1 text-[9px]"
                  >
                    <input name="coverStart" defaultValue={startStr} disabled={isPending} className="w-10 bg-slate-800 text-center border border-slate-600 rounded py-0.5 text-white disabled:opacity-50" />
                    <input name="coverEnd" defaultValue={endStr} disabled={isPending} className="w-10 bg-slate-800 text-center border border-slate-600 rounded py-0.5 text-white disabled:opacity-50" />
                    <button type="submit" disabled={isPending} className="flex items-center justify-center gap-1 bg-amber-500 px-1.5 rounded font-bold text-slate-950 disabled:opacity-60">
                      {isPending ? <Spinner className="w-2.5 h-2.5" /> : 'Go'}
                    </button>
                    <button type="button" disabled={isPending} onClick={closePicker} className="bg-slate-700 px-1 rounded disabled:opacity-50">X</button>
                  </form>
                )}
                {error && showTimePicker === assignment.id && (
                  <p className="text-[8px] font-semibold text-rose-300 text-center px-1">{error}</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  );
}
