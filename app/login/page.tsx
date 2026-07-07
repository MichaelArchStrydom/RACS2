'use client'

/**
 * app/login/page.tsx
 *
 * Public route — no auth guard needed here.
 * Uses useActionState so the server action can return inline errors
 * without a full page navigation.
 */

import { useActionState } from 'react'
import { loginAction, type LoginState } from '@/app/actions/authActions'

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState<LoginState, FormData>(loginAction, null)

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Header */}
        <div className="text-center space-y-1">
          <div className="text-4xl mb-3"></div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">RACS2</h1>
          <p className="text-sm text-slate-500">Station Roster System</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border p-8 space-y-5">
          <h2 className="text-base font-semibold text-slate-700">Sign in to your account</h2>

          {/* Error banner — only shown when the action returns an error */}
          {state?.error && (
            <div
              role="alert"
              className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium px-4 py-3 rounded-lg"
            >
              <span>⚠️</span>
              <span>{state.error}</span>
            </div>
          )}

          <form action={formAction} className="space-y-4">

            {/* Username */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                required
                disabled={isPending}
                placeholder="firstname.lastname"
                className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent disabled:opacity-50 disabled:bg-slate-50 transition"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                disabled={isPending}
                className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent disabled:opacity-50 disabled:bg-slate-50 transition"
              />
            </div>

            {/* Remember me */}
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  name="rememberMe"
                  id="rememberMe"
                  defaultChecked
                  disabled={isPending}
                  className="w-4 h-4 rounded border-slate-300 text-rose-500 focus:ring-rose-400 cursor-pointer disabled:opacity-50"
                />
              </div>
              <div>
                <span className="text-sm font-medium text-slate-700">Remember me</span>
                <p className="text-xs text-slate-400">Stay signed in for 30 days</p>
              </div>
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={isPending}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:bg-slate-300 disabled:text-slate-500 text-white font-semibold rounded-lg transition-colors text-sm tracking-wide shadow-sm"
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Signing in…
                </span>
              ) : 'Sign In'}
            </button>

          </form>
        </div>

        {/* Footer hint */}
        <p className="text-center text-xs text-slate-400">
          Default password is <span className="font-mono font-semibold">changeme123</span>
          {' '}— contact admin if you need a reset.
        </p>

      </div>
    </div>
  )
}
