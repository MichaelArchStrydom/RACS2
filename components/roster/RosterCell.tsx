'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRosterInteraction } from './RosterInteractionContext'

//FIX: Desktop roster currently not filling the roster div. grouping to the left. looks horrible

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
    const isCovered = !!assignment.actualMemberId && assignment.actualMemberId !== assignment.memberId
    const start = new Date(assignment.startTime).getTime()
    const end = new Date(assignment.endTime).getTime()
    const currentOwner = assignment.actualMemberId ?? assignment.memberId
    const isRequested = slotRequests.some(r => {
      if (r.requestedById !== currentOwner || r.status !== 'PENDING') return false
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
      r.requestedById === (assignment.actualMemberId ?? assignment.memberId) &&
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
        const isCovered = !!assignment.actualMemberId && assignment.actualMemberId !== assignment.memberId;

        const assignmentStart = new Date(assignment.startTime).getTime()
        const assignmentEnd = new Date(assignment.endTime).getTime()

        const isRequested = slotRequests.some(r => {
          if (r.requestedById !== (assignment.actualMemberId ?? assignment.memberId) || r.status !== 'PENDING') return false
          const reqStart = new Date(r.startTime).getTime()
          const reqEnd = new Date(r.endTime).getTime()
          return reqStart < assignmentEnd && reqEnd > assignmentStart
        })

        const activeMember = isCovered ? assignment.actualMember : assignment.member;
        const nameFormatted = activeMember
          ? `${activeMember.lastName}, ${activeMember.firstName.charAt(0)}.`
          : 'Unknown';

        const startStr = new Date(assignment.startTime).toLocaleTimeString("en-NZ", { timeZone: 'Pacific/Auckland', hour: "2-digit", minute: "2-digit", hour12: false });
        const endStr = new Date(assignment.endTime).toLocaleTimeString("en-NZ", { timeZone: 'Pacific/Auckland', hour: "2-digit", minute: "2-digit", hour12: false });

        let cellStyles = "bg-white text-slate-800 border-slate-200"
        if (isRequested) {
          cellStyles = "bg-yellow-100 text-yellow-900 border-yellow-300 font-medium animate-pulse-subtle"
        } else if (isCovered) {
          cellStyles = "bg-blue-100 text-blue-900 border-blue-300 font-bold"
        }
        if (activeMember?.id === activeUserId && !isPending && !isRequested) {
          cellStyles = "bg-green-200 text-green-900 border-green-300 font-medium"
        }
        if (activeMember?.id === activeUserId && isRequested) {
          cellStyles = "bg-red-200 text-red-900 border-red-300 font-medium"
        }

        const isActiveMember = activeMember?.id === activeUserId
        const currentRequest = assignment._matchedRequest ?? null

        const closePicker = () => {
          setShowTimePicker(null)
          setError(null)
        }

        const handleCellTap = () => {
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
            className={`group relative flex flex-col justify-center px-1.5 py-1 rounded border text-[11.5px] transition-all shadow-sm select-none [-webkit-touch] ${cellStyles}`}
          >
            <div className="flex flex-col items-center justify-between">
              <span className="whitespace-nowrap">{nameFormatted}</span>
              <span className="text-[8px] opacity-60 font-mono tracking-tighter whitespace-nowrap">{startStr}-{endStr}</span>
            </div>


          </div>
        )
      })}
    </div>
  );
}
