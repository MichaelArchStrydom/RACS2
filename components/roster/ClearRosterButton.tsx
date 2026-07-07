'use client'

interface ClearRosterButtonProps {
  defaultStart: string;
  defaultEnd: string;
  userId: string;
  clearRosterAction: (fd: FormData) => Promise<void>;
}

export default function ClearRosterButton({ defaultStart, defaultEnd, userId, clearRosterAction }: ClearRosterButtonProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const confirmation = confirm('This will permanently delete all slots and assignments in this range. Continue?');
    if (!confirmation) {
      e.preventDefault();
    }
  };

  return (
    <form action={clearRosterAction} onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <input type="hidden" name="adminId" value={userId} />

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-500">Clear From</label>
        <input name="clearStart" type="date" defaultValue={defaultStart} required className="border rounded-lg px-3 py-2 text-sm" />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-500">Clear To (inclusive)</label>
        <input name="clearEnd" type="date" defaultValue={defaultEnd} required className="border rounded-lg px-3 py-2 text-sm" />
      </div>

      <div className="flex items-end">
        <button
          type="submit"
          className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          🗑 Clear Range
        </button>
      </div>
    </form>
  );
}
