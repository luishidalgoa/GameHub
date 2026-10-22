'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export interface AdminNavItem {
  href: string
  label: string
  badge?: number
}

/**
 * The admin's sections as plain text tabs. The current one is the pill that is lit; a
 * section is current on its own page and on any page under it (/admin/games/4451 is Juegos).
 */
export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname()
  const isCurrent = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`))

  return (
    <nav aria-label="Secciones del admin" className="flex flex-wrap gap-2 mb-8 border-b border-border pb-4">
      {items.map(item => {
        const current = isCurrent(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={`px-3 py-2 rounded-lg text-sm transition-colors ${
              current
                ? 'bg-[#1d1830] text-[#ddd6fe] font-semibold'
                : 'text-[#9b9ba8] hover:text-foreground hover:bg-accent/50'
            }`}
          >
            {item.label}
            {item.badge !== undefined && (
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium leading-none align-middle">
                {item.badge}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
