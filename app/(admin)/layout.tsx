import { requireAdmin } from '@/lib/auth'
import AdminLayoutShell from '@/components/navmenu/AdminLayoutShell'

interface AdminLayoutProps {
  children: React.ReactNode
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const admin = await requireAdmin()

  // Pass ONLY the fields the client shell needs — the full member row
  // includes the password hash, and any prop handed to a Client Component
  // gets serialized into the page payload sent to the browser.
  return (
    <AdminLayoutShell admin={{ id: admin.id, firstName: admin.firstName, lastName: admin.lastName }}>
      {children}
    </AdminLayoutShell>
  )
}
