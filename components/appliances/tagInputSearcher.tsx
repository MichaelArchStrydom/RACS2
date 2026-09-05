'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

interface TagInputSearcherProps {
  allItems: string[]
  selected: string[]
  onChange: (next: string[]) => void
  label: string
}

export default function TagInputSearcher({ allItems, selected, onChange, label }: TagInputSearcherProps) {
  const [query, setQuery] = useState('')

  const suggestions = allItems.filter(item =>
    !selected.includes(item) &&
    item.toLowerCase().includes(query.toLowerCase())
  )

  const addTag = (item: string) => {
    onChange([...selected, item])
    setQuery('')
  }

  const removeTag = (item: string) => {
    onChange(selected.filter(s => s !== item))
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1 bg-white border rounded-lg px-2 py-1.5">
        {selected.map(item => (
          <span key={item} className="flex items-center gap-1 bg-slate-600 text-white text-xs px-2 py-1 rounded-full">
            {item}
            <button type="button" onClick={() => removeTag(item)}>
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={label}
          className="flex-1 min-w-20 text-sm outline-none"
        />
      </div>

      {query && suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-sm max-h-40 overflow-y-auto">
          {suggestions.map(item => (
            <button
              type="button"
              key={item}
              onClick={() => addTag(item)}
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
