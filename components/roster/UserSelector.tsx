'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface UserSelectorProps {
  members: any[]
  activeUserId: string
}

export default function UserSelector({ members, activeUserId }: UserSelectorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('user', e.target.value)
    router.push(`/?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm text-xs">
      <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Logged In As:</span>
      <select
        value={activeUserId}
        onChange={handleChange}
        className="bg-transparent border-none font-bold text-slate-800 focus:outline-none cursor-pointer"
      >
        {members.map(m => (
          <option key={m.id} value={m.id}>
            {m.lastName}, {m.firstName} ({m.rank})
          </option>
        ))}
      </select>
    </div>
  )
}
