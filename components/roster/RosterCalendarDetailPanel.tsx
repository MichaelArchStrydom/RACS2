'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { generateRoster } from '@/app/actions/adminActions'
import Spinner from '@/components/Spinner'
import type { CalendarSlot, CrewOption, ApplianceOption } from './RosterCalendarTypes'

interface RosterCalendarDetailPanelProps {
  dateStr: string
  dateLabel: string
  slots: CalendarSlot[]
  crews: CrewOption[]
  appliances: ApplianceOption[]
  adminId: string
  hasPendingChanges: boolean
  onQueueCancel: (slotId: string) => void
  onQueueReplaceCrew: (slotId: string, crewId: string) => void
  onQueueAddAppliance: (applianceName: string, crewId: string) => void
  onDiscardPending: () => void
  onClose: () => void
}

export default function RosterCalendarDetailPanel({
  dateStr,
  dateLabel,
  slots,
  crews,
  appliances,
  adminId,
  hasPendingChanges,
  onQueueCancel,
  onQueueReplaceCrew,
  onQueueAddAppliance,
  onDiscardPending,
  onClose,
}: RosterCalendarDetailPanelProps) {
  const router = useRouter()
  const [manualMode, setManualMode] = useState(false)
  const [replaceSelections, setReplaceSelections] = useState<Record<string, string>>({})
  const [newApplianceName, setNewApplianceName] = useState('')
  const [newApplianceCrewId, setNewApplianceCrewId] = useState('')
  const [autogenDays, setAutogenDays] = useState(14)
  const [showAutogenInput, setShowAutogenInput] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const usedApplianceNames = new Set(slots.map(s => s.appliance))
  const availableAppliances = appliances.filter(a => !usedApplianceNames.has(a.name))

  const handleAutogenerate = () => {
    setError(null)
    startTransition(async () => {
      try {
        await generateRoster(adminId, dateStr, autogenDays)
        router.refresh()
      } catch (e: any) {
        setError(e?.message ?? 'Something went wrong generating this range.')
      }
    })
  }

  const handleAddAppliance = () => {
    if (!newApplianceName || !newApplianceCrewId) return
    onQueueAddAppliance(newApplianceName, newApplianceCrewId)
    setNewApplianceName('')
    setNewApplianceCrewId('')
  }

  const handleCancelShift = (slotId: string) => {
    if (!confirm('Cancel this shift? It will show as cancelled once you save.')) return
    onQueueCancel(slotId)
  }

  const handleReplaceCrew = (slotId: string) => {
    const crewId = replaceSelections[slotId]
    if (!crewId) return
    onQueueReplaceCrew(slotId, crewId)
    setReplaceSelections(prev => ({ ...prev, [slotId]: '' }))
  }

  const isUngenerated = slots.length === 0 && !manualMode

  return (
    <section className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">{dateLabel}</h2>
          {hasPendingChanges && (
            <p className="text-[11px] font-semibold text-rose-500 mt-0.5">Unsaved changes on this day</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasPendingChanges && (
            <button
              type="button"
              onClick={onDiscardPending}
              className="text-xs font-semibold text-slate-400 hover:text-rose-600 px-2 py-1 rounded transition-colors"
            >
              Discard changes
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1"
          >
            ✕
          </button>
        </div>
      </div>

      {isUngenerated ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">No shifts generated for this day yet.</p>

          <div className="flex flex-col gap-2">
            {!showAutogenInput ? (
              <button
                type="button"
                onClick={() => setShowAutogenInput(true)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                ⚙️ Autogenerate from here
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-slate-50 border rounded-lg p-3">
                <label className="text-xs font-semibold text-slate-500 shrink-0">Days:</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={autogenDays}
                  onChange={e => setAutogenDays(Number(e.target.value))}
                  className="w-20 border rounded-lg px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleAutogenerate}
                  className="flex items-center justify-center gap-1.5 flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  {isPending && <Spinner className="w-3.5 h-3.5" />}
                  {isPending ? 'Generating…' : 'Confirm'}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setManualMode(true)}
              className="w-full py-2 bg-white border hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg transition-colors"
            >
              ✍️ Enter manual mode
            </button>

            <Link
              href={`/admin/crews?user=${adminId}`}
              className="w-full text-center py-2 bg-white border hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg transition-colors"
            >
              🔀 Change crew order
            </Link>
          </div>

          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {slots.map(slot => (
            <div key={slot.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-800">{slot.appliance}</p>
                  <p className={`text-xs ${slot.status === 'CANCELLED' ? 'text-slate-400 line-through' : 'text-slate-500'}`}>
                    {slot.status === 'CANCELLED' ? 'Cancelled' : (slot.watchName ?? 'Mixed crew')}
                  </p>
                  {slot.assignments.length > 0 && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {slot.assignments.map(a => `${a.applianceRole}: ${a.memberName}`).join(' · ')}
                    </p>
                  )}
                </div>
              </div>

              {slot.status !== 'CANCELLED' && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={replaceSelections[slot.id] ?? ''}
                    onChange={e => setReplaceSelections(prev => ({ ...prev, [slot.id]: e.target.value }))}
                    className="border rounded-lg px-2 py-1.5 text-xs bg-white"
                  >
                    <option value="">— replace crew —</option>
                    {crews.map(c => (
                      <option key={c.id} value={c.id}>{c.watchName}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!replaceSelections[slot.id]}
                    onClick={() => handleReplaceCrew(slot.id)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 disabled:opacity-40 transition-colors"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCancelShift(slot.id)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 transition-colors"
                  >
                    Cancel Shift
                  </button>
                </div>
              )}
            </div>
          ))}

          {availableAppliances.length > 0 && (
            <div className="border border-dashed rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-500">+ Add Appliance</p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={newApplianceName}
                  onChange={e => setNewApplianceName(e.target.value)}
                  className="border rounded-lg px-2 py-1.5 text-xs bg-white"
                >
                  <option value="">— appliance —</option>
                  {availableAppliances.map(a => (
                    <option key={a.name} value={a.name}>{a.name}</option>
                  ))}
                </select>
                <select
                  value={newApplianceCrewId}
                  onChange={e => setNewApplianceCrewId(e.target.value)}
                  className="border rounded-lg px-2 py-1.5 text-xs bg-white"
                >
                  <option value="">— crew —</option>
                  {crews.map(c => (
                    <option key={c.id} value={c.id}>{c.watchName}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!newApplianceName || !newApplianceCrewId}
                  onClick={handleAddAppliance}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border bg-green-50 text-green-700 border-green-200 hover:bg-green-100 disabled:opacity-40 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
