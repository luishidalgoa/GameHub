'use client'

import { useState, useMemo, useCallback } from 'react'
import { mutate } from 'swr'
import { GameCard } from './GameCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { GameDetailModal } from '@/components/game/GameDetailModal'
import type { GameListItem } from '@/types/game'

type SortKey = 'title' | 'year' | 'added' | 'size'

interface Props {
  games: (GameListItem & { fileName: string })[]
  platformSlug: string
  isAdmin?: boolean
  thumbnailWidth?: number
  thumbnailHeight?: number
}

export function GameGrid({ games, platformSlug, isAdmin = false, thumbnailWidth = 200, thumbnailHeight = 300 }: Props) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('title')
  const [favOnly, setFavOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const filtered = useMemo(() => {
    let list = games
    if (search) list = list.filter((g) => g.title.toLowerCase().includes(search.toLowerCase()))
    if (favOnly) list = list.filter((g) => g.isFavorite)

    return [...list].sort((a, b) => {
      if (sort === 'title') return (a.sortTitle ?? a.title).localeCompare(b.sortTitle ?? b.title)
      if (sort === 'year') return (a.releaseYear ?? 0) - (b.releaseYear ?? 0)
      if (sort === 'size') return Number(BigInt(b.fileSize) - BigInt(a.fileSize))
      return 0
    })
  }, [games, search, sort, favOnly])

  const handleToggleFavorite = useCallback(async (id: number, current: boolean) => {
    await fetch(`/api/games/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite: !current }),
    })
    mutate(`/api/games?platform=${platformSlug}`)
  }, [platformSlug])

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        {/* Search — full width on mobile */}
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-48 bg-secondary border border-border rounded-md px-3 py-2.5 sm:py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />

        {/* Controls row — inline on mobile, inline on desktop */}
        <div className="flex items-center gap-2 sm:contents">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="flex-1 sm:flex-none bg-secondary border border-border rounded-md px-3 py-2.5 sm:py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring touch-manipulation"
          >
            <option value="title">Sort: Title</option>
            <option value="year">Sort: Year</option>
            <option value="size">Sort: Size</option>
          </select>

          <button
            onClick={() => setFavOnly((v) => !v)}
            className={`flex-1 sm:flex-none px-3 py-2.5 sm:py-1.5 text-sm rounded-md border transition-colors touch-manipulation ${
              favOnly
                ? 'bg-red-600/20 border-red-600/40 text-red-400'
                : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            ♥ Favorites
          </button>

          <span className="text-sm text-muted-foreground whitespace-nowrap sm:ml-auto">
            {filtered.length}/{games.length}
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-4">
          {filtered.map((g) => (
            <GameCard
              key={g.id}
              game={g}
              onSelect={setSelectedId}
              onToggleFavorite={handleToggleFavorite}
              isAdmin={isAdmin}
              thumbnailWidth={thumbnailWidth}
              thumbnailHeight={thumbnailHeight}
            />
          ))}
        </div>
      )}

      {selectedId !== null && (
        <GameDetailModal
          gameId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}
