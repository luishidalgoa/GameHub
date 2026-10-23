import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ChevronRight, Tag } from 'lucide-react'
import { AdminNav } from '@/components/admin/AdminNav'
import { LogoutButton } from '@/components/admin/LogoutButton'
import { db } from '@/lib/db'
import { getAppVersion, type AppVersionInfo } from '@/lib/version'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [t, missingCount] = await Promise.all([
    getTranslations('AdminLayout'),
    db.game.count({ where: { isHidden: true } }),
  ])
  const version = getAppVersion()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="text-primary font-medium">{t('breadcrumb')}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
        <LogoutButton />
      </div>

      <AdminNav items={[
        { href: '/admin', label: t('dashboard') },
        { href: '/admin/catalogo', label: t('catalog'), also: ['/admin/arte', '/admin/editoras', '/admin/modelos'] },
        { href: '/admin/games', label: t('games') },
        { href: '/admin/mantenimiento', label: t('maintenance'), badge: missingCount || undefined, also: ['/admin/escaner', '/admin/metadatos', '/admin/almacen', '/admin/integridad', '/admin/graveyard', '/admin/curation'] },
        { href: '/admin/traffic', label: t('traffic') },
        { href: '/admin/donations', label: t('donations') },
        { href: '/admin/settings', label: t('settings') },
      ]} />

      {children}

      <AdminVersionFooter info={version} />
    </div>
  )
}

function AdminVersionFooter({ info }: { info: AppVersionInfo }) {
  const label = info.isSemver ? `v${info.version}` : info.version
  const tooltip = [
    info.isReleaseBuild ? 'Release build' : 'Local / dev build',
    info.commit ? `commit ${info.commit}` : null,
    info.buildTime ? `built ${info.buildTime}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const inner = (
    <span className="inline-flex items-center gap-1.5">
      <Tag className="w-3 h-3" />
      GameHub {label}
      {!info.isReleaseBuild && (
        <span className="text-[10px] uppercase tracking-wide opacity-70">dev</span>
      )}
    </span>
  )

  return (
    <div className="mt-12 pt-4 border-t border-border flex justify-end">
      {info.releaseUrl ? (
        <a
          href={info.releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={tooltip}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {inner}
        </a>
      ) : (
        <span title={tooltip} className="text-xs text-muted-foreground">
          {inner}
        </span>
      )}
    </div>
  )
}

