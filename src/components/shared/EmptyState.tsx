'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Gamepad2, Ghost, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Icons referencable by name. Server Components MUST use the string form: a
// LucideIcon is a function, and functions can't cross the server→client boundary
// ("Functions cannot be passed directly to Client Components"). Passing the
// component directly is only valid from other Client Components.
const NAMED_ICONS = { gamepad2: Gamepad2, ghost: Ghost } as const
type IconName = keyof typeof NAMED_ICONS

interface Action {
  label: string
  href?: string
  onClick?: () => void
}

interface Props {
  /**
   * Lucide icon to feature. Defaults to a gamepad. From a Server Component pass
   * a name (e.g. "ghost"); from a Client Component you may pass the component.
   */
  icon?: LucideIcon | IconName
  title?: string
  description?: string
  /** Optional call-to-action rendered as a button (onClick) or link (href). */
  action?: Action
  /** Extra content under the description (e.g. secondary links). */
  children?: ReactNode
  /** Vertical padding. `compact` for inline lists, default for full pages. */
  size?: 'default' | 'compact'
  className?: string
}

/**
 * Friendly empty state with a bit of personality: the featured icon sits inside
 * a softly-glowing, gently-floating badge (the float is killed under
 * prefers-reduced-motion via the global media query). Reused across grids,
 * lists, search and the recently-viewed page.
 */
export function EmptyState({
  icon = Gamepad2,
  title,
  description,
  action,
  children,
  size = 'default',
  className,
}: Props) {
  const t = useTranslations('EmptyState')
  const Icon: LucideIcon = typeof icon === 'string' ? (NAMED_ICONS[icon] ?? Gamepad2) : icon

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'compact' ? 'py-12' : 'py-20',
        className,
      )}
    >
      {/* Glowing, floating icon badge */}
      <div className="relative mb-5">
        <div
          aria-hidden
          className="absolute inset-0 rounded-full bg-primary/20 blur-2xl animate-pulse"
        />
        <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-secondary/80 border border-border/60 shadow-inner animate-float">
          <Icon className="w-7 h-7 text-muted-foreground" strokeWidth={1.5} />
        </div>
      </div>

      <h3 className="text-lg font-semibold text-foreground/90">{title ?? t('title')}</h3>
      <p className="text-sm text-muted-foreground/70 mt-1.5 max-w-xs leading-relaxed">
        {description ?? t('description')}
      </p>

      {action && (
        <div className="mt-5">
          {action.href ? (
            <Link
              href={action.href}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {action.label}
            </Link>
          ) : (
            <button
              onClick={action.onClick}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {action.label}
            </button>
          )}
        </div>
      )}

      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
