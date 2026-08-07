'use client'

import { Trash2 } from 'lucide-react'
import { useState } from 'react'

interface Seat {
  id: string
  seats: string
  seatsAbbr: string
}

interface SeatManagerProps {
  initialSeats: { seats: string; seatsAbbr: string }[]
}

export default function SeatManager({ initialSeats }: SeatManagerProps) {
  const [seats, setSeats] = useState<Seat[]>(
    initialSeats.map((seat) => ({ ...seat, id: crypto.randomUUID() }))
  )

  const updateSeat = (id: string, field: 'seats' | 'seatsAbbr', value: string) => {
    setSeats((prev) => prev.map((seat) => (seat.id === id ? { ...seat, [field]: value } : seat)))
  }

  return (
    <details className="bg-white border rounded-xl shadow-sm">
      <summary className="px-3 py-2 cursor-pointer text-sm font-semibold text-slate-700 hover:text-rose-600"> Manage Seats</summary>
      <div className="px-5 pb-5">
        <p className="text-xs text-amber-600 mb-2">
          Renaming a seat&apos;s Name (not its Label) can disconnect it from real roster
          assignments — the roster generator still assigns seats using fixed internal
          names, so existing shifts for a renamed seat may stop showing up here.
        </p>
        <label className="px-1 py-1 text-s font-semibold text-slate-500"></label>
        <label className="px-1 py-1 text-s font-semibold text-slate-500">Name</label>
        <label className="px-1 py-1 text-s font-semibold text-slate-500">Label</label>
        {seats.map((seat, i) => (
          <div key={seat.id} className="flex gap-2 py-1 min-w-min">
            <label className="px-1 py-1 text-s font-semibold text-slate-500">{i + 1}</label>
            <input
              name="seatLabels"
              type="text"
              value={seat.seats}
              onChange={(e) => updateSeat(seat.id, 'seats', e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              name="seatAbbr"
              type="text"
              value={seat.seatsAbbr}
              onChange={(e) => updateSeat(seat.id, 'seatsAbbr', e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setSeats((prev) => prev.filter((s) => s.id !== seat.id))}
              className="px-2 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-lg flex items-center justify-center">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <div className="px-3 py-1">
          <button
            type="button"
            onClick={() => setSeats((prev) => [...prev, { id: crypto.randomUUID(), seats: '', seatsAbbr: '' }])}
            className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-lg"
          >+ Add Seat
          </button>
        </div>
      </div>
    </details>
  )
}
