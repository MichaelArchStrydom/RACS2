'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useRosterInteraction } from './RosterInteractionContext'
import { saveEditedTimeline } from '@/app/actions/rosterActions'
import { formatNZTime } from '@/lib/timezone'
import Spinner from '@/components/Spinner'

export default function EditModeToggleButton({ isModerator }: { isModerator: boolean }) {
  const router = useRouter()
  const { isEditMode, toggleEditMode, exitEditMode, editDraft, dirtyKeys } = useRosterInteraction()
  const [isSaving, startSaveTransition] = useTransition()

  if (!isModerator) return null

  if (!isEditMode) {
    return (
      <button
        type="button"
        onClick={toggleEditMode}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg border bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200 transition-colors whitespace-nowrap"
      >
        Edit Mode
      </button>
    )
  }

  function handleSave() {
    startSaveTransition(async () => {
      if (editDraft) {
        await Promise.all(
          Array.from(dirtyKeys).map((key) => {
            const [dateStr, applianceName, applianceRole] = key.split('|')
            const segments = (editDraft[key] ?? []).map((a) => ({
              memberId: a.memberId,
              startStr: formatNZTime(a.startTime),
              endStr: formatNZTime(a.endTime),
            }))
            return saveEditedTimeline(dateStr, applianceName, applianceRole, segments)
          })
        )
      }
      exitEditMode()
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={exitEditMode}
        disabled={isSaving}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg border bg-white text-slate-600 border-slate-300 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border bg-rose-600 text-white border-rose-700 hover:bg-rose-700 disabled:opacity-50 transition-colors whitespace-nowrap"
      >
        {isSaving && <Spinner className="w-3.5 h-3.5" />}
        {isSaving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
