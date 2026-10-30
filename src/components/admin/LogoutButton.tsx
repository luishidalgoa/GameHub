'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { AdminButton } from '@/components/admin/AdminButton'

export function LogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/admin/login')
    router.refresh()
  }

  return (
    <AdminButton variant="ghost" size="sm" onClick={handleLogout}>
      <LogOut className="w-3.5 h-3.5" />
      Sign out
    </AdminButton>
  )
}
