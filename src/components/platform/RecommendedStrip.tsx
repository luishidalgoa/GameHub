'use client'

import { ViewTransitionLink } from '@/components/shared/ViewTransitionLink'
import { useTranslations } from 'next-intl'
import { getPlatformIdentity } from '@/lib/platform-identity'

export interface RecommendedGame {
  id: number
  title: string
  /** Already-resolved cover URL (proxy URL or external), computed server-side. */
  cover: string | null
  releaseYear: number | null
}

interface Props {
  games: RecommendedGame[]
  thumbnailWidth:  number | null
  thumbnailHeight: number | null
  /** Platform slug — tints the hover ring with the console's brand color. */
  platformSlug?: string
}

/**
 * Compact, minimalist "Recommended" strip shown at the top of a platform page.
 * Mirrors RecentStrip but stays deliberately small so it doesn't steal focus
 * from the main game grid. Rendered only when there are enough recommendations
 * (the caller returns nothing otherwise).
 */
export function RecommendedStrip({ games, thumbnailWidth, thumbnailHeight, platformSlug }: Props) {
  const t = useTranslations('Platform')
  if (games.length < 3) return null

  const w = thumbnailWidth  ?? 2
  const h = thumbnailHeight ?? 3
  // Tint the hover ring with the console's brand color (shared identity source).
  const identity = platformSlug ? getPlatformIdentity(platformSlug) : null

  return (
    <section
      className="mb-6"
      style={identity ? ({ '--platform-glow': identity.glow } as React.CSSProperties) : undefined}
    >
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {t('recommended')}
      </h2>

      <div
        className="flex gap-3 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {games.map((game) => (
          <ViewTransitionLink
            key={game.id}
            href={`/game/${game.id}`}
            coverName={`game-cover-${game.id}`}
            className="group shrink-0 w-[72px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          >
            <div
              data-vt-cover
              className={`w-full rounded-md overflow-hidden bg-secondary relative mb-1.5 ring-0 group-hover:ring-1 transition-all duration-150 ${identity ? 'ring-[color:var(--platform-glow)]' : 'ring-primary/50'}`}
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
          </ViewTransitionLink>
        ))}
      </div>
    </section>
  )
}
