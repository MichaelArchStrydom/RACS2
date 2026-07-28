'use client'

import Link from 'next/link'

export default function MemberError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-md mx-auto mt-16 space-y-4 text-center">
      <div className="bg-white rounded-xl border shadow-sm p-8 space-y-4">
        <h1 className="text-lg font-bold text-slate-800">Something went wrong</h1>
        <p className="text-sm text-slate-500">
          This page hit an unexpected error. Your session and data are safe — try reloading this section.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={reset}
            className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition-colors"
          >
            Back to Roster
          </Link>
        </div>
      </div>
    </div>
  )
}
