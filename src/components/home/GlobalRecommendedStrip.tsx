'use client'

import { ViewTransitionLink } from '@/components/shared/ViewTransitionLink'
import { useTranslations } from 'next-intl'

export interface GlobalRecGame {
  id: number
  title: string
  cover: string | null     // already-resolved URL
  platformName: string
  thumbnailWidth:  number | null
  thumbnailHeight: number | null
}

/**
 * Cross-platform "Recommended" strip on the home page, ranked by objective
 * popularity. Mirrors RecentStrip (shows platform name per item). Renders
 * nothing when there's no popularity data yet — so the home degrades gracefully
 * until the popularity sync has run.
 */
export function GlobalRecommendedStrip({ games }: { games: GlobalRecGame[] }) {
  const t = useTranslations('Home')
  if (games.length === 0) return null

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {t('recommended')}
      </h2>

      <div
        className="flex gap-3 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {games.map((game) => {
          const w = game.thumbnailWidth  ?? 2
          const h = game.thumbnailHeight ?? 3
          return (
            <ViewTransitionLink
              key={game.id}
              href={`/game/${game.id}`}
              coverName={`game-cover-${game.id}`}
              className="group shrink-0 w-[72px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
            >
              <div
                data-vt-cover
                className="w-full rounded-md overflow-hidden bg-secondary relative mb-1.5 ring-0 group-hover:ring-1 ring-primary/50 transition-all duration-150"
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
              <p className="text-[10px] text-muted-foreground/50 mt-0.5 truncate">
                {game.platformName}
              </p>
            </ViewTransitionLink>
          )
        })}
      </div>
    </section>
  )
}
