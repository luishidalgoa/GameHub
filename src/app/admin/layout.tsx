import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { LayoutDashboard, Gamepad2, Settings, BarChart2, Heart, Ghost, ChevronRight } from 'lucide-react'
import { LogoutButton } from '@/components/admin/LogoutButton'
import { db } from '@/lib/db'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [t, missingCount] = await Promise.all([
    getTranslations('AdminLayout'),
    db.game.count({ where: { isHidden: true } }),
  ])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="text-primary font-medium">{t('breadcrumb')}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
        <LogoutButton />
      </div>

      <div className="flex flex-wrap gap-2 mb-8 border-b border-border pb-4">
        <AdminTab href="/admin"            icon={<LayoutDashboard className="w-4 h-4" />} label={t('dashboard')} />
        <AdminTab href="/admin/games"      icon={<Gamepad2 className="w-4 h-4" />}        label={t('games')} />
        <AdminTab href="/admin/graveyard"  icon={<Ghost className="w-4 h-4" />}           label={t('graveyard')} badge={missingCount || undefined} />
        <AdminTab href="/admin/traffic"    icon={<BarChart2 className="w-4 h-4" />}       label={t('traffic')} />
        <AdminTab href="/admin/donations"  icon={<Heart className="w-4 h-4" />}           label={t('donations')} />
        <AdminTab href="/admin/settings"   icon={<Settings className="w-4 h-4" />}        label={t('settings')} />
      </div>

      {children}
    </div>
  )
}

function AdminTab({ href, icon, label, badge }: { href: string; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-4 py-2 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
    >
      {icon}
      {label}
      {badge !== undefined && (
        <span className="ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium leading-none">
          {badge}
        </span>
      )}
    </Link>
  )
}
