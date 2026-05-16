import Link from 'next/link'
import { LayoutDashboard, Gamepad2, Settings, BarChart2, Heart, ChevronRight } from 'lucide-react'
import { LogoutButton } from '@/components/admin/LogoutButton'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="text-primary font-medium">Admin</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
        <LogoutButton />
      </div>

      <div className="flex gap-2 mb-8 border-b border-border pb-4">
        <AdminTab href="/admin" icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" />
        <AdminTab href="/admin/games" icon={<Gamepad2 className="w-4 h-4" />} label="Games" />
        <AdminTab href="/admin/traffic" icon={<BarChart2 className="w-4 h-4" />} label="Traffic" />
        <AdminTab href="/admin/donations" icon={<Heart className="w-4 h-4" />} label="Donations" />
        <AdminTab href="/admin/settings" icon={<Settings className="w-4 h-4" />} label="Settings" />
      </div>

      {children}
    </div>
  )
}

function AdminTab({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-4 py-2 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
    >
      {icon}
      {label}
    </Link>
  )
}
