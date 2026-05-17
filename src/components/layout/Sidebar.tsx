'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import useSWR from 'swr'
import { Gamepad2, Settings, LayoutDashboard, Home, X, Heart, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import type { Platform } from '@/types/platform'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const PLATFORM_ICONS: Record<string, string> = {
  switch: '🎮',
  '3ds': '📱',
  nds: '🎯',
  wii: '🕹️',
  psp: '🎮',
  psvita: '🎮',
}

const PLATFORM_COLORS: Record<string, string> = {
  switch: 'text-red-500',
  '3ds': 'text-red-400',
  nds: 'text-orange-400',
  wii: 'text-sky-400',
  psp: 'text-blue-500',
  psvita: 'text-blue-400',
}

interface Props {
  open?: boolean
  onClose?: () => void
}

export function Sidebar({ open, onClose }: Props) {
  const pathname = usePathname()
  const t = useTranslations('Sidebar')
  const { data: platforms } = useSWR<Platform[]>('/api/platforms', fetcher)
  const { data: auth } = useSWR<{ admin: boolean }>('/api/auth/me', fetcher)
  const { data: ipData } = useSWR<{ isAdminIp: boolean }>('/api/auth/is-admin-ip', fetcher)

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full w-64 md:w-56 bg-card border-r border-border flex flex-col z-30',
        'transition-transform duration-300 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-border">
        <div className="flex items-center gap-2">
          <Gamepad2 className="w-7 h-7 text-primary" />
          <span className="font-bold text-lg tracking-tight">GameHub</span>
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

        {platforms && platforms.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider px-3 mb-1">
              {t('platforms')}
            </p>
            {platforms.map((p) => (
              <NavItem
                key={p.slug}
                href={`/platform/${p.slug}`}
                icon={<span className="text-base leading-none">{PLATFORM_ICONS[p.slug] ?? '🎮'}</span>}
                label={p.name}
                badge={p._count?.games}
                pathname={pathname}
                activeColor={PLATFORM_COLORS[p.slug]}
                onNavigate={onClose}
              />
            ))}
          </div>
        )}
      </nav>

      {/* Bottom links */}
      <div className="border-t border-border px-2 py-3 space-y-1">
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
            <NavItem
              href="/admin/settings"
              icon={<Settings className="w-4 h-4" />}
              label={t('settings')}
              pathname={pathname}
              onNavigate={onClose}
            />
          </>
        )}

        {/* Language switcher */}
        <LanguageSwitcher />
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
  onNavigate,
}: {
  href: string
  icon: React.ReactNode
  label: string
  badge?: number
  pathname: string
  activeColor?: string
  onNavigate?: () => void
}) {
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href))

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-3 px-3 py-3 md:py-2 rounded-md text-sm transition-colors group',
        isActive
          ? `bg-accent ${activeColor} font-medium`
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
      )}
    >
      <span className={cn('flex-shrink-0', isActive ? activeColor : 'group-hover:text-foreground')}>
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && (
        <span className="text-xs text-muted-foreground tabular-nums">{badge}</span>
      )}
    </Link>
  )
}
