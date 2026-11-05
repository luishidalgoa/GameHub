'use client'

import Link from 'next/link'
import { BrandMark } from '@/components/shared/BrandMark'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import useSWR from 'swr'
import { LayoutDashboard, Home, X, Heart, Shield, User, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { getPlatformIdentity } from '@/lib/platform-identity'
import { familyOf, menuEntries, type PlatformFamily } from '@/lib/platform-family'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import type { Platform } from '@/types/platform'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/**
 * Labels of the desktop rail: hidden while the rail is collapsed to its icons and
 * revealed as it grows on hover. On phones the drawer is always open, so they show.
 */
const RAIL_LABEL = 'md:max-w-0 md:opacity-0 md:group-hover/rail:max-w-[11rem] md:group-hover/rail:opacity-100 overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200'

interface Props {
  open?: boolean
  onClose?: () => void
}

export function Sidebar({ open, onClose }: Props) {
  const pathname = usePathname()
  const t = useTranslations('Sidebar')
  const { data: platforms } = useSWR<Platform[]>('/api/platforms', fetcher)
  const { data: families } = useSWR<PlatformFamily[]>('/api/platform-families', fetcher)
  const currentPlatform = pathname?.match(/^\/platform\/([^/]+)/)?.[1]
  const currentFamily = currentPlatform && families ? familyOf(families, currentPlatform) : undefined
  const platformMenuPath = currentFamily ? `/platform/${currentFamily.slug}` : pathname
  const { data: auth } = useSWR<{ admin: boolean }>('/api/auth/me', fetcher)
  const { data: ipData } = useSWR<{ isAdminIp: boolean }>('/api/auth/is-admin-ip', fetcher)

  return (
    <aside
      className={cn(
        'group/rail fixed left-0 top-0 h-full w-64 md:w-14 md:hover:w-56 md:hover:shadow-2xl bg-card border-r border-border flex flex-col z-30',
        'transition-[transform,width] duration-300 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 md:px-[14px] py-5 border-b border-border">
        <div className="flex items-center gap-2">
          <BrandMark className="w-7 h-7 flex-shrink-0" />
          <span className={cn('font-bold text-lg tracking-tight', RAIL_LABEL)}>GameHub</span>
        </div>
        <button
          onClick={onClose}
          className="md:hidden p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
          aria-label={t('closeMenu')}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <NavItem
          href="/"
          icon={<Home className="w-4 h-4" />}
          label={t('library')}
          pathname={pathname}
          onNavigate={onClose}
        />
        <NavItem
          href="/recent"
          icon={<History className="w-4 h-4" />}
          label={t('recent')}
          pathname={pathname}
          onNavigate={onClose}
        />

        {platforms && platforms.length > 0 && (
          <div className="mt-4">
            <p className={cn('text-xs text-muted-foreground font-semibold uppercase tracking-wider px-3 mb-1', RAIL_LABEL)}>
              {t('platforms')}
            </p>
            {menuEntries(platforms, families ?? []).map((e) => (
              <NavItem
                key={e.key}
                href={e.href}
                icon={<PlatformIcon slug={e.iconSlug} iconPath={e.iconPath} size={16} />}
                label={e.name}
                badge={e.badge}
                pathname={platformMenuPath}
                activeColor={getPlatformIdentity(e.iconSlug).accent}
                compact
                onNavigate={onClose}
              />
            ))}
          </div>
        )}
      </nav>

      {/* Bottom links */}
      <div className="border-t border-border px-2 py-3 space-y-1">
        {/* Hecho por */}
        <NavItem
          href="/about"
          icon={<User className="w-4 h-4" />}
          label={t('madeBy')}
          pathname={pathname}
          onNavigate={onClose}
        />
        {/* Donate — always visible */}
        <NavItem
          href="/donate"
          icon={<Heart className="w-4 h-4" />}
          label={t('support')}
          pathname={pathname}
          activeColor="text-red-400"
          onNavigate={onClose}
        />
        {/* Privacy */}
        <NavItem
          href="/privacy"
          icon={<Shield className="w-4 h-4" />}
          label={t('privacy')}
          pathname={pathname}
          onNavigate={onClose}
        />

        {/* Admin links — only visible if accessing from public IP */}
        {ipData?.isAdminIp && (
          <>
            <NavItem
              href="/admin"
              icon={<LayoutDashboard className="w-4 h-4" />}
              label={t('admin')}
              pathname={pathname}
              onNavigate={onClose}
            />
          </>
        )}

        {/* Language switcher */}
        <div className={RAIL_LABEL}>
          <LanguageSwitcher />
        </div>
      </div>
    </aside>
  )
}

function NavItem({
  href,
  icon,
  label,
  badge,
  pathname,
  activeColor = 'text-primary',
  compact = false,
  onNavigate,
}: {
  href: string
  icon: React.ReactNode
  label: string
  badge?: number
  pathname: string
  activeColor?: string
  compact?: boolean
  onNavigate?: () => void
}) {
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href + '/'))

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-3 md:gap-0 md:group-hover/rail:gap-3 px-3 rounded-md transition-[gap,color,background-color] duration-200 group',
        compact ? 'py-1 text-xs' : 'py-3 md:py-2 text-sm',
        isActive
          ? `bg-accent ${activeColor} font-medium`
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
      )}
    >
      <span className={cn('flex-shrink-0', isActive ? activeColor : 'group-hover:text-foreground')}>
        {icon}
      </span>
      <span className={cn('flex-1 truncate', RAIL_LABEL)}>{label}</span>
      {badge !== undefined && (
        <span className={cn('text-xs text-muted-foreground tabular-nums', RAIL_LABEL)}>{badge}</span>
      )}
    </Link>
  )
}
