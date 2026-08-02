'use client'

import { usePathname } from 'next/navigation'
import { AdminNavLinks } from '@/components/navmenu/NavMenuPanel'
import PageShell from '@/components/navmenu/PageShell'

interface AdminLayoutShellProps {
  admin: { id: string; firstName: string; lastName: string }
  children: React.ReactNode
}

export default function AdminLayoutShell({ admin, children }: AdminLayoutShellProps) {
  const pathname = usePathname()
  const current = AdminNavLinks
    .filter(item => pathname === item.href || pathname.startsWith(item.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]
  const heading = current?.label ?? 'Admin'

  const widthClass = pathname === '/admin/members' ? 'max-w-6xl' : 'max-w-4xl'

  return (
    <PageShell
      heading={heading}
      isAdmin
      userId={admin.id}
      memberName={`${admin.firstName} ${admin.lastName}`}
      widthClass={widthClass}
      mainClassName="[&_input]:bg-white [&_input]:text-slate-800 [&_input]:placeholder-slate-400 [&_select]:bg-white [&_select]:text-slate-800 [&_input::placeholder]:text-slate-800"
    >
      {children}
    </PageShell>
  )
}
