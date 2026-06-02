'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { History, Trash2 } from 'lucide-react'
import { getRecentlyViewed, clearRecentlyViewed } from '@/lib/recently-viewed'
import { EmptyState } from '@/components/shared/EmptyState'

interface RecentGame {
  id: number
  title: string
  coverPath: string | null
  coverUrl: string | null
  releaseYear: number | null
  platform: { slug: string; name: string; thumbnailWidth: number | null; thumbnailHeight: number | null }
}

export default function RecentPage() {
  const t = useTranslations('Recent')
  const [games, setGames] = useState<RecentGame[] | null>(null)

  useEffect(() => {
    const ids = getRecentlyViewed()
    if (ids.length === 0) { setGames([]); return }
    fetch(`/api/games/by-ids?ids=${ids.join(',')}`)
      .then(r => r.json())
      .then((data: { games: RecentGame[] }) => {
        // Reorder to match the local most-recent-first list (the API is unordered).
        const byId = new Map(data.games.map(g => [g.id, g]))
        setGames(ids.map(id => byId.get(id)).filter((g): g is RecentGame => !!g))
      })
      .catch(() => setGames([]))
  }, [])

  const clear = () => { clearRecentlyViewed(); setGames([]) }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-muted-foreground" />
            {t('title')}
          </h1>
          {games && games.length > 0 && (
            <p className="text-muted-foreground mt-1">{t('subtitle', { count: games.length })}</p>
          )}
        </div>
        {games && games.length > 0 && (
          <button
            onClick={clear}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md bg-secondary border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            {t('clear')}
          </button>
        )}
      </div>

      {games === null ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card animate-pulse">
              <div style={{ aspectRatio: '2/3' }} className="bg-muted" />
              <div className="p-2 space-y-1.5"><div className="h-3 bg-muted rounded w-4/5" /></div>
            </div>
          ))}
        </div>
      ) : games.length === 0 ? (
        <EmptyState
          icon={History}
          title={t('empty')}
          description={t('emptyHint')}
          action={{ label: t('emptyCta'), href: '/' }}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-4">
          {games.map(game => {
            const cover = game.coverPath ?? game.coverUrl
            const w = game.platform.thumbnailWidth ?? 2
            const h = game.platform.thumbnailHeight ?? 3
            return (
              <Link
                key={game.id}
                href={`/game/${game.id}`}
                className="group rounded-lg overflow-hidden bg-card border border-border hover:border-primary/40 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40"
              >
                <div style={{ aspectRatio: `${w}/${h}` }} className="relative bg-secondary overflow-hidden">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt={game.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-4xl font-bold text-muted-foreground/30 select-none">
                        {game.title.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-xs font-medium text-foreground leading-tight line-clamp-2">{game.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{game.platform.name}</p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
