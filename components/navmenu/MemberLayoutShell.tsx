'use client'

import { usePathname } from 'next/navigation'
import PageShell from '@/components/navmenu/PageShell'

const memberNavItems = [
  { href: '/', label: 'RACS 2', widthClass: 'max-w-7xl' },
  { href: '/profile', label: 'Profile & Settings', widthClass: 'max-w-2xl' },
  { href: '/contacts', label: 'Contacts', widthClass: 'max-w-2xl' },
  { href: '/stats', label: 'Hour Leaderboard', widthClass: 'max-w-3xl' },
]

interface MemberLayoutShellProps {
  member: { id: string; firstName: string; lastName: string; isAdmin: boolean }
  children: React.ReactNode
}

export default function MemberLayoutShell({ member, children }: MemberLayoutShellProps) {
  const pathname = usePathname()
  const current = memberNavItems.find(item => pathname === item.href)
  const heading = current?.label ?? 'RACS2'

  return (
    <PageShell
      heading={heading}
      isAdmin={member.isAdmin}
      userId={member.id}
      memberName={`${member.firstName} ${member.lastName}`}
      widthClass={current?.widthClass ?? 'max-w-7xl'}
    >
      {children}
    </PageShell>
  )
}
