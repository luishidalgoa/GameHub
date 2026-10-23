'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { History, Trash2 } from 'lucide-react'
import { getRecentlyViewed, clearRecentlyViewed } from '@/lib/recently-viewed'
import { EmptyState } from '@/components/shared/EmptyState'
import { Masonry } from '@/components/home/Masonry'
import { GridTile } from '@/components/home/GridTile'
import { groupByTitle } from '@/lib/game-groups'
import type { TileGame } from '@/lib/home-data'

export default function RecentPage() {
  const t = useTranslations('Recent')
  const [games, setGames] = useState<TileGame[] | null>(null)

  useEffect(() => {
    const ids = getRecentlyViewed()
    if (ids.length === 0) { setGames([]); return }
    fetch(`/api/games/by-ids?ids=${ids.join(',')}`)
      .then(r => r.json())
      .then((data: { games: TileGame[] }) => {
        // Reorder to match the local most-recent-first list (the API is unordered).
        const byId = new Map(data.games.map(g => [g.id, g]))
        setGames(ids.map(id => byId.get(id)).filter((g): g is TileGame => !!g))
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
        <Masonry>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="mb-4 break-inside-avoid rounded-xl border border-white/10 bg-white/[0.06] animate-pulse" style={{ aspectRatio: '2/3' }} />
          ))}
        </Masonry>
      ) : games.length === 0 ? (
        <EmptyState
          icon={History}
          title={t('empty')}
          description={t('emptyHint')}
          action={{ label: t('emptyCta'), href: '/' }}
        />
      ) : (
        // The same grid as /explorar/nuevos: the masonry of glass tiles.
        <Masonry>
          {groupByTitle(games).map(g => <GridTile key={g.game.id} group={g} />)}
        </Masonry>
      )}
    </div>
  )
}
