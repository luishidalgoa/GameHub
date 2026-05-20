'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

export interface RecentGame {
  id: number
  title: string
  coverPath: string | null
  coverUrl:  string | null
  releaseYear: number | null
  platform: {
    slug: string
    name: string
    thumbnailWidth:  number | null
    thumbnailHeight: number | null
  }
}

export function RecentStrip({ games }: { games: RecentGame[] }) {
  const t = useTranslations('Home')

  if (games.length === 0) return null

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {t('recentlyAdded')}
      </h2>

      <div
        className="flex gap-3 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {games.map((game) => {
          const cover = game.coverPath ?? game.coverUrl
          const w = game.platform.thumbnailWidth  ?? 2
          const h = game.platform.thumbnailHeight ?? 3
          return (
            <Link
              key={game.id}
              href={`/game/${game.id}`}
              className="group shrink-0 w-[72px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
            >
              <div
                className="w-full rounded-md overflow-hidden bg-secondary relative mb-1.5 ring-0 group-hover:ring-1 ring-primary/50 transition-all duration-150"
                style={{ aspectRatio: `${w}/${h}` }}
              >
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cover}
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
                {game.platform.name}
              </p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
