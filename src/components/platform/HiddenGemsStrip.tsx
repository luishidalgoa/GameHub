'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Gem } from 'lucide-react'
import type { RecommendedGame } from './RecommendedStrip'

interface Props {
  games: RecommendedGame[]
  thumbnailWidth:  number | null
  thumbnailHeight: number | null
}

/**
 * "Hidden gems": highly-rated but not widely owned games on this platform — a
 * discovery footer below the grid. Same compact layout as RecommendedStrip.
 * Renders nothing when there aren't enough gems.
 */
export function HiddenGemsStrip({ games, thumbnailWidth, thumbnailHeight }: Props) {
  const t = useTranslations('Platform')
  if (games.length < 3) return null

  const w = thumbnailWidth  ?? 2
  const h = thumbnailHeight ?? 3

  return (
    <section className="mt-10 pt-6 border-t border-border/60">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Gem className="w-3.5 h-3.5 text-emerald-400" />
        {t('hiddenGems')}
      </h2>

      <div
        className="flex gap-3 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {games.map((game) => (
          <Link
            key={game.id}
            href={`/game/${game.id}`}
            className="group shrink-0 w-[72px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          >
            <div
              className="w-full rounded-md overflow-hidden bg-secondary relative mb-1.5 ring-0 group-hover:ring-1 ring-emerald-500/50 transition-all duration-150"
              style={{ aspectRatio: `${w}/${h}` }}
            >
              {game.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={game.cover}
                  alt={game.title}
                  className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-200"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-xl font-bold text-muted-foreground/30 select-none">
                    {game.title.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            <p className="text-[11px] leading-tight line-clamp-2 text-foreground/70 group-hover:text-foreground transition-colors">
              {game.title}
            </p>
          </Link>
        ))}
      </div>
    </section>
  )
}
