'use client'

import { useState, useMemo, useCallback } from 'react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('GameGrid')
  const [search, setSearch]   = useState('')
  const [sort, setSort]       = useState<SortKey>('title')
  const [favOnly, setFavOnly] = useState(false)
  const [region, setRegion]   = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // Unique regions present in this platform's games
  const regions = useMemo(() => {
    const set = new Set<string>()
    for (const g of games) if (g.region) set.add(g.region)
    return Array.from(set).sort()
  }, [games])

  const filtered = useMemo(() => {
    let list = games
    if (search)  list = list.filter((g) => g.title.toLowerCase().includes(search.toLowerCase()))
    if (favOnly) list = list.filter((g) => g.isFavorite)
    if (region)  list = list.filter((g) => g.region === region)

    return [...list].sort((a, b) => {
      if (sort === 'title') return (a.sortTitle ?? a.title).localeCompare(b.sortTitle ?? b.title)
      if (sort === 'year') return (a.releaseYear ?? 0) - (b.releaseYear ?? 0)
      if (sort === 'size') return Number(BigInt(b.fileSize) - BigInt(a.fileSize))
      return 0
    })
  }, [games, search, sort, favOnly, region])

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
          placeholder={t('search')}
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
            <option value="title">{t('sortTitle')}</option>
            <option value="year">{t('sortYear')}</option>
            <option value="size">{t('sortSize')}</option>
          </select>

          {regions.length > 1 && (
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className={`flex-1 sm:flex-none bg-secondary border rounded-md px-3 py-2.5 sm:py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring touch-manipulation transition-colors ${
                region
                  ? 'border-primary/60 text-foreground'
                  : 'border-border text-muted-foreground'
              }`}
            >
              <option value="">{t('allRegions')}</option>
              {regions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => setFavOnly((v) => !v)}
            className={`flex-1 sm:flex-none px-3 py-2.5 sm:py-1.5 text-sm rounded-md border transition-colors touch-manipulation ${
              favOnly
                ? 'bg-red-600/20 border-red-600/40 text-red-400'
                : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('favorites')}
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
