'use client'

import { Trash2 } from 'lucide-react'
import { useState } from 'react'

interface Seat {
  seats: string
  seatsAbbr: string
}

interface SeatManagerProps {
  initialSeats: Seat[]
}

export default function SeatManager({ initialSeats }: SeatManagerProps) {
  const [seats, setSeats] = useState<Seat[]>(initialSeats)
  return (
    <details className="bg-white border rounded-xl shadow-sm">
      <summary className="px-3 py-2 cursor-pointer text-sm font-semibold text-slate-700 hover:text-rose-600"> Manage Seats</summary>
      <div className="px-5 pb-5">
        <label className="px-1 py-1 text-s font-semibold text-slate-500"></label>
        <label className="px-1 py-1 text-s font-semibold text-slate-500">Name</label>
        <label className="px-1 py-1 text-s font-semibold text-slate-500">Label</label>
        {seats.map((seat, i) => (
          <div key={i} className="flex gap-2 py-1 min-w-min">
            <label className="px-1 py-1 text-s font-semibold text-slate-500">{i + 1}</label>
            <input name="seatLabels" type="text" defaultValue={seat.seats} className="border rounded-lg px-3 py-2 text-sm" />
            <input name="seatAbbr" type="text" defaultValue={seat.seatsAbbr} className="border rounded-lg px-3 py-2 text-sm" />
            <button
              type="button"
              onClick={() => setSeats(prev => prev.filter((_, idx) => idx !== i))}
              className="px-2 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-lg flex items-center justify-center">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <div className="px-3 py-1">
          <button
            type="button"
            onClick={() => setSeats(prev => [...prev, { seats: '', seatsAbbr: '' }])}
            className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-lg"
          >+ Add Seat
          </button>
        </div>
      </div>
    </details>
  )
}
