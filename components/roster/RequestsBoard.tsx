'use client'

import { useState } from 'react'
import StandInRequestItem from '@/components/roster/StandInRequestItem'

interface RequestsBoardProps {
  requests: any[];
  activeUserId: string;
}

export default function RequestsBoard({ requests, activeUserId }: RequestsBoardProps) {
  // Toggle state: default to false (hide covered shifts)
  const [showCovered, setShowCovered] = useState(false)

  // Filter the requests based on the toggle state
  const filteredRequests = requests.filter(req => {
    if (showCovered) return true;
    return req.status === 'PENDING';
  })

  const pendingCount = requests.filter(r => r.status === 'PENDING').length

  return (
    <section className="bg-white p-5 rounded-xl shadow-sm border space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-rose-600 flex items-center gap-2">
          <span>Active Stand-In Requests</span>
          {pendingCount > 0 && (
            <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full text-xs font-bold">
              {pendingCount} Open
            </span>
          )}
        </h2>

        {/* The Toggle Switch */}
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border">
          <input
            type="checkbox"
            checked={showCovered}
            onChange={(e) => setShowCovered(e.target.checked)}
            className="rounded text-rose-500 focus:ring-rose-500 cursor-pointer"
          />
          Show Covered Shifts
        </label>
      </div>

      {filteredRequests.length === 0 ? (
        <p className="text-xs text-slate-400 italic">
          {requests.length === 0
            ? "No active cover or stand-in requests for this period."
            : "No pending requests. Toggle 'Show Covered Shifts' to view history."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 divide-y divide-slate-100">
          {filteredRequests.map((request) => (
            <StandInRequestItem
              key={request.id}
              request={request}
              activeUserId={activeUserId}
            />
          ))}
        </div>
      )}
    </section>
  )
}
