import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { PlatformFamily } from '@/lib/platform-family'

export function FamilyChips({ family, current }: { family: PlatformFamily; current: string }) {
  return (
    <nav aria-label={family.name} className="mb-3 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">{family.name}:</span>
      {family.members.map(m => (
        <Link
          key={m.slug}
          href={`/platform/${m.slug}`}
          aria-current={m.slug === current ? 'page' : undefined}
          className={cn(
            'rounded-full border px-3 py-1 font-medium',
            m.slug === current
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border text-muted-foreground hover:bg-accent',
          )}
        >
          {m.label}
        </Link>
      ))}
    </nav>
  )
}
