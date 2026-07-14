import { requireMember } from '@/lib/auth'
import MemberLayoutShell from '@/components/navmenu/MemberLayoutShell'

interface MemberLayoutProps {
  children: React.ReactNode
}

export default async function MemberLayout({ children }: MemberLayoutProps) {
  const member = await requireMember()

  // Pass ONLY the fields the client shell needs — the full member row
  // includes the password hash, and any prop handed to a Client Component
  // gets serialized into the page payload sent to the browser.
  return (
    <MemberLayoutShell
      member={{ id: member.id, firstName: member.firstName, lastName: member.lastName, isAdmin: member.isAdmin }}
    >
      {children}
    </MemberLayoutShell>
  )
}
