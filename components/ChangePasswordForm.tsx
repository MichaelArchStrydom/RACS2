'use client'

import { useActionState } from 'react'
import { changePasswordAction, type ChangePasswordState } from '@/app/actions/profileActions'

export default function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState<ChangePasswordState, FormData>(changePasswordAction, null)

  return (
    <form action={formAction} className="space-y-3 max-w-sm">
      {state && 'error' in state && (
        <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{state.error}</p>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-500">Current Password</label>
        <input name="currentPassword" type="password" required disabled={isPending} className="border rounded-lg px-3 py-2 text-sm disabled:opacity-50" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-500">New Password</label>
        <input name="newPassword" type="password" required minLength={8} disabled={isPending} className="border rounded-lg px-3 py-2 text-sm disabled:opacity-50" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-500">Confirm New Password</label>
        <input name="confirmPassword" type="password" required minLength={8} disabled={isPending} className="border rounded-lg px-3 py-2 text-sm disabled:opacity-50" />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
      >
        {isPending ? 'Updating…' : 'Change Password'}
      </button>
      <p className="text-[11px] text-slate-400">You'll be signed out on all devices after changing your password.</p>
    </form>
  )
}
