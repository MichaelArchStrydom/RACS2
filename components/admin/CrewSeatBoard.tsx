'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setCrewSeatPositions, updateCrew } from '@/app/actions/adminActions'
import { TriangleAlert, GripVertical } from 'lucide-react'
import Spinner from '@/components/Spinner'

interface CrewMemberForBoard {
  id: string
  firstName: string
  lastName: string
  rank: string
  seatPosition: number | null
  qualifications: { qualification: { key: string } | null }[]
}

interface CrewSeatBoardProps {
  crewId: string
  adminId: string
  watchName: string
  members: CrewMemberForBoard[]
}

const ROLE_LABELS = ['OIC', 'Driver', 'FF1', 'FF2', 'FF3'] as const

//color coding for qualified seats
const ROLE_STYLE: Record<string, { badge: string }> = {
  OIC: { badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  Driver: { badge: 'bg-blue-100 text-blue-700 border-blue-200' },
  FF1: { badge: 'bg-slate-100 text-slate-600 border-slate-200' },
  FF2: { badge: 'bg-slate-100 text-slate-600 border-slate-200' },
  FF3: { badge: 'bg-slate-100 text-slate-600 border-slate-200' },
}

function hasQual(member: CrewMemberForBoard, key: string): boolean {
  return member.qualifications.some((mq) => mq.qualification?.key === key)
}

// Warning is just visual.
// I like leaving freedom to admins where possible...
function seatWarning(member: CrewMemberForBoard, slotIndex: number): string | null {
  if (member.rank === 'RCFF' && slotIndex !== 4) return 'Recruit outside FF3'
  if (slotIndex === 0 && !hasQual(member, 'SO_QUALIFIED')) return 'Not SO qualified'
  if (slotIndex === 1 && !hasQual(member, 'PUMP_OP')) return 'Not Pump Op qualified'
  return null
}

interface DragState {
  pointerId: number
  memberId: string
  dragging: boolean
  ghostEl: HTMLDivElement | null
  startX: number
  startY: number
}

function MemberCard({
  member, slotIndex, onPointerDown, onPointerMove, onPointerUp,
}: {
  member: CrewMemberForBoard
  slotIndex: number | null
  onPointerDown: (e: React.PointerEvent, memberId: string) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
}) {
  const warning = slotIndex !== null ? seatWarning(member, slotIndex) : null
  return (
    <div
      onPointerDown={(e) => onPointerDown(e, member.id)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ touchAction: 'none' }}
      className="group flex items-center gap-1.5 pl-1.5 pr-2 py-1.5 rounded-lg border border-slate-200 bg-white shadow-sm select-none cursor-grab active:cursor-grabbing hover:border-rose-200 hover:shadow transition-all"
      title={warning ?? undefined}
    >
      <GripVertical className="w-3 h-3 text-slate-300 group-hover:text-rose-300 shrink-0" />
      <span className="text-xs font-medium text-slate-700 truncate flex-1">{`${member.lastName}, ${member.firstName.charAt(0)}.`}</span>
      {warning && <TriangleAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
      <span className="font-mono text-[10px] text-slate-400 shrink-0">{member.rank}</span>
    </div>
  )
}

// Drag and drop members into the seats you want for future generations.
// 'bench' just uses the old system to deligate seats
export default function CrewSeatBoard({ crewId, adminId, watchName, members }: CrewSeatBoardProps) {
  const router = useRouter()
  const [positions, setPositions] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(members.map((m) => [m.id, m.seatPosition]))
  )
  const [watchNameDraft, setWatchNameDraft] = useState(watchName)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSaveTransition] = useTransition()
  const [dragHoverTarget, setDragHoverTarget] = useState<string | null>(null)
  const dragRef = useRef<DragState | null>(null)

  useEffect(() => {
    setPositions(Object.fromEntries(members.map((m) => [m.id, m.seatPosition])))
    setWatchNameDraft(watchName)
    setDirty(false)
    setError(null)
  }, [members, watchName])

  const memberById = new Map(members.map((m) => [m.id, m]))
  const slotMemberIds: (string | null)[] = ROLE_LABELS.map(
    (_, i) => Object.keys(positions).find((id) => positions[id] === i) ?? null
  )
  const benchMembers = members.filter((m) => positions[m.id] == null)

  function displayName(m: CrewMemberForBoard): string {
    return `${m.lastName}, ${m.firstName.charAt(0)}.`
  }

  function dropTargetKey(el: HTMLElement): string {
    return el.dataset.bench === 'true' ? 'bench' : `slot-${el.dataset.slotIndex}`
  }

  function handlePointerDown(e: React.PointerEvent, memberId: string) {
    ; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { pointerId: e.pointerId, memberId, dragging: false, ghostEl: null, startX: e.clientX, startY: e.clientY }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY

    if (!drag.dragging) {
      if (Math.hypot(dx, dy) < 8) return
      drag.dragging = true
      const member = memberById.get(drag.memberId)
      const ghost = document.createElement('div')
      ghost.textContent = member ? displayName(member) : ''
      Object.assign(ghost.style, {
        position: 'fixed', pointerEvents: 'none', zIndex: '9999',
        padding: '4px 8px', borderRadius: '6px',
        background: 'rgba(225, 29, 72, 0.9)', color: 'white',
        fontSize: '11px', fontWeight: '600',
        boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
        transform: 'translate(-100%, -100%)',
      })
      document.body.appendChild(ghost)
      drag.ghostEl = ghost
    }

    if (drag.ghostEl) {
      drag.ghostEl.style.left = `${e.clientX - 12}px`
      drag.ghostEl.style.top = `${e.clientY - 12}px`
    }

    const hoverEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-slot-index], [data-bench]') as HTMLElement | null
    setDragHoverTarget(hoverEl ? dropTargetKey(hoverEl) : null)
  }

  function handlePointerUp(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    drag.ghostEl?.remove()
    setDragHoverTarget(null)
    if (!drag.dragging) return

    const dropEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-slot-index], [data-bench]') as HTMLElement | null
    if (!dropEl) return

    setPositions((prev) => {
      const draggedFrom = prev[drag.memberId] ?? null

      if (dropEl.dataset.bench === 'true') {
        if (draggedFrom === null) return prev
        return { ...prev, [drag.memberId]: null }
      }

      const targetIndex = Number(dropEl.dataset.slotIndex)
      if (Number.isNaN(targetIndex) || draggedFrom === targetIndex) return prev

      const occupantId = Object.keys(prev).find((id) => id !== drag.memberId && prev[id] === targetIndex) ?? null
      const next = { ...prev, [drag.memberId]: targetIndex }
      if (occupantId) next[occupantId] = draggedFrom
      return next
    })
    setDirty(true)
  }

  function handleReset() {
    setPositions(Object.fromEntries(members.map((m) => [m.id, m.seatPosition])))
    setWatchNameDraft(watchName)
    setDirty(false)
    setError(null)
  }

  function handleWatchNameChange(value: string) {
    setWatchNameDraft(value)
    setDirty(true)
  }

  function handleSave() {
    setError(null)
    const trimmedName = watchNameDraft.trim()
    if (!trimmedName) {
      setError('Watch name cannot be empty.')
      return
    }
    startSaveTransition(async () => {
      try {
        const payload = Object.entries(positions)
          .filter((entry): entry is [string, number] => entry[1] !== null)
          .map(([memberId, seatPosition]) => ({ memberId, seatPosition }))
        const tasks = [setCrewSeatPositions(adminId, crewId, payload)]
        if (trimmedName !== watchName) tasks.push(updateCrew(adminId, crewId, { watchName: trimmedName }))
        await Promise.all(tasks)
        router.refresh()
        setDirty(false)
      } catch (e: any) {
        setError(e.message ?? 'Something went wrong saving.')
      }
    })
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}

      <div>
        <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Watch Name</p>
        <input
          value={watchNameDraft}
          onChange={(e) => handleWatchNameChange(e.target.value)}
          className="w-full border rounded-lg px-2 py-1.5 text-sm font-medium text-slate-800"
        />
      </div>

      <div>
        <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Seat Positions</p>
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-2 space-y-1.5">
          {ROLE_LABELS.map((label, i) => {
            const memberId = slotMemberIds[i]
            const member = memberId ? memberById.get(memberId) ?? null : null
            const style = ROLE_STYLE[label]
            const isHovered = dragHoverTarget === `slot-${i}`
            return (
              <div key={label} className="flex items-center gap-2 ">
                <div className={`flex items-center justify-center gap-1 w-16 shrink-0 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wide ${style.badge}`}>
                  {label}
                </div>
                <div
                  data-slot-index={i}
                  className={`flex-1 min-h-0.5 rounded-lg border-2 border-dashed flex items-center px-1 transition-colors ${isHovered ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white/60'
                    }`}
                >
                  {member ? (
                    <div className="w-full">
                      <MemberCard member={member} slotIndex={i} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} />
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-300 italic pl-2 py-2">Empty — bench fills this on generation</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div
          data-bench="true"
          className={`mt-1.5 rounded-xl border-2 border-dashed p-2.5 transition-colors ${dragHoverTarget === 'bench' ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-slate-50/30'
            }`}
        >
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Bench — unpositioned</p>
          <div className="flex flex-wrap gap-1.5">
            {benchMembers.length === 0 && <span className="text-[10px] text-slate-300 italic px-1 ">Everyone&apos;s positioned</span>}
            {benchMembers.map((m) => (
              <div key={m.id} className="w-[calc(50%-0.19rem)] min-w-35">
                <MemberCard member={m} slotIndex={null} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        {dirty && (
          <button type="button" onClick={handleReset} disabled={isSaving} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50">
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || isSaving}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500 hover:bg-rose-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          {isSaving && <Spinner className="w-3.5 h-3.5" />}
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
