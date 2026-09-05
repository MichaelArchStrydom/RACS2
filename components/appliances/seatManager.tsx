'use client'

import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import TagInputSearcher from './tagInputSearcher'


interface Seat {
  id: string
  seats: string
  seatsAbbr: string
  quals: string[]
}

interface SeatManagerProps {
  initialSeats: { seats: string; seatsAbbr: string; quals?: string[] }[]
  allQuals: string[]
}

// local only insecure keys 
const makeLocalId = () => Math.random().toString(36).slice(2)

export default function SeatManager({ initialSeats, allQuals }: SeatManagerProps) {
  const [seats, setSeats] = useState<Seat[]>(
    initialSeats.map((seat) => ({ ...seat, id: makeLocalId(), quals: seat.quals ?? [] }))
  )

  const updateSeat = (id: string, field: 'seats' | 'seatsAbbr', value: string) => {
    setSeats((prev) => prev.map((seat) => (seat.id === id ? { ...seat, [field]: value } : seat)))
  }

  const updateSeatQuals = (id: string, quals: string[]) => {
    setSeats((prev) => prev.map((seat) => (seat.id === id ? { ...seat, quals } : seat)))
  }

  return (
    <details className="bg-slate-100 border rounded-xl shadow-sm flex-col">
      <summary className="px-3 py-2 cursor-pointer text-sm font-semibold text-slate-700 hover:text-rose-600"> Manage Seats</summary>
      <div className="px-5 pb-5">
        <div className="flex ">
          <span className='w-5' />
          <label className="flex-1 px-1 py-1 text-s font-semibold text-slate-500">Name</label>
          <label className="flex-1 px-1 py-1 text-s font-semibold text-slate-500">Label</label>
          <span className='w-9' />
        </div>
        {seats.map((seat, i) => (
          <div key={seat.id}>
            <div className="overflow-x-auto flex gap-2 py-1">
              <label className="px-1 py-1 text-s font-semibold text-slate-500">{i + 1}</label>
              <input
                name="seatLabels"
                type="text"
                value={seat.seats}
                onChange={(e) => updateSeat(seat.id, 'seats', e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2 text-sm min-w-0"
              />
              <input
                name="seatAbbr"
                type="text"
                value={seat.seatsAbbr}
                onChange={(e) => updateSeat(seat.id, 'seatsAbbr', e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2 text-sm min-w-0"
              />
              <button
                type="button"
                onClick={() => setSeats((prev) => prev.filter((s) => s.id !== seat.id))}
                className="px-2 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-lg flex items-center justify-center">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2 mb-2 py-0.5">
              <span className="w-4" />
              <div className="flex-1">
                <TagInputSearcher
                  allItems={allQuals}
                  selected={seat.quals}
                  onChange={(quals) => updateSeatQuals(seat.id, quals)}
                  label="+ Qual Requirements..."
                />
              </div>
              <span className="w-8" />
              <input type="hidden" name="seatQuals" value={JSON.stringify(seat.quals)} />
            </div>
          </div>
        ))}
        <div className="flex px-6 py-1">
          <button
            type="button"
            onClick={() => setSeats((prev) => [...prev, { id: makeLocalId(), seats: '', seatsAbbr: '', quals: [] }])}
            className="w-full px-6 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-lg"
          >+ Add Seat
          </button>
          <span className="w-4" />
        </div>
      </div>
    </details>
  )
}
