'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import useSWRInfinite from 'swr/infinite'
import { useTranslations } from 'next-intl'
import { GameCard, SkeletonCard } from './GameCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { GameDetailModal } from '@/components/game/GameDetailModal'
import type { GameListItem } from '@/types/game'

// ── Constants ──────────────────────────────────────────────────────────────────
const PAGE_SIZE    = 24   // divisible by 2, 3, 4, 6 → fits every column count
const SENTINEL_PX  = 400  // start fetching when within 400 px of the bottom

type SortKey = 'title' | 'year' | 'size'

interface ApiPage {
  games: (GameListItem & { fileName: string })[]
  total: number
}

interface Props {
  platformSlug:   string
  isAdmin?:       boolean
  thumbnailWidth?:  number
  thumbnailHeight?: number
  totalCount:     number
  regions:        string[]
}

const fetcher = (url: string): Promise<ApiPage> =>
  fetch(url).then(r => { if (!r.ok) throw new Error('fetch failed'); return r.json() })

// ── Component ──────────────────────────────────────────────────────────────────
export function GameGrid({
  platformSlug,
  isAdmin       = false,
  thumbnailWidth  = 200,
  thumbnailHeight = 300,
  totalCount,
  regions,
}: Props) {
  const t = useTranslations('GameGrid')

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [search,    setSearch]   = useState('')
  const [sort,      setSort]     = useState<SortKey>('title')
  const [favOnly,   setFavOnly]  = useState(false)
  const [region,    setRegion]   = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // Debounce search so we don't fire a request on every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(debounceTimer.current)
  }, [search])

  // ── SWR Infinite ─────────────────────────────────────────────────────────────
  const getKey = useCallback((pageIndex: number, prev: ApiPage | null) => {
    // Stop when we've consumed all results
    if (prev && pageIndex * PAGE_SIZE >= prev.total) return null

    const p = new URLSearchParams({
      platform: platformSlug,
      page:     String(pageIndex + 1),
      pageSize: String(PAGE_SIZE),
      sort,
    })
    if (debouncedSearch) p.set('search',    debouncedSearch)
    if (favOnly)         p.set('favorites', 'true')
    if (region)          p.set('region',    region)

    return `/api/games?${p}`
  }, [platformSlug, sort, debouncedSearch, favOnly, region])

  const { data, size, setSize, isValidating, mutate } = useSWRInfinite<ApiPage>(
    getKey,
    fetcher,
    { revalidateFirstPage: false, revalidateOnFocus: false },
  )

  const games   = useMemo(() => data?.flatMap(d => d.games) ?? [], [data])
  const total   = data?.[0]?.total ?? totalCount
  const hasMore = games.length < total

  const isLoadingInitial = !data && isValidating
  const isLoadingMore    = isValidating && size > (data?.length ?? 0)

  // ── Infinite scroll sentinel ──────────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !isValidating) {
          setSize(s => s + 1)
        }
      },
      { rootMargin: `${SENTINEL_PX}px` },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore, isValidating, setSize])

  // ── Favorite toggle ───────────────────────────────────────────────────────────
  const handleToggleFavorite = useCallback(async (id: number, current: boolean) => {
    await fetch(`/api/games/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ isFavorite: !current }),
    })
    // Optimistic update in SWR cache
    mutate(
      pages => pages?.map(page => ({
        ...page,
        games: page.games.map(g => g.id === id ? { ...g, isFavorite: !current } : g),
      })),
      { revalidate: false },
    )
  }, [mutate])

  // ── Skeleton count ────────────────────────────────────────────────────────────
  // Show a full page of skeletons on first load, a half-page when appending
  const skeletonCount = isLoadingInitial ? PAGE_SIZE : isLoadingMore ? PAGE_SIZE / 2 : 0

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Filters */}
      <div className="mb-6 space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        {/* Search */}
        <input
          type="text"
          placeholder={t('search')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-48 bg-secondary border border-border rounded-md px-3 py-2.5 sm:py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />

        {/* Controls row */}
        <div className="flex items-center gap-2 sm:contents">
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="flex-1 sm:flex-none bg-secondary border border-border rounded-md px-3 py-2.5 sm:py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring touch-manipulation"
          >
            <option value="title">{t('sortTitle')}</option>
            <option value="year">{t('sortYear')}</option>
            <option value="size">{t('sortSize')}</option>
          </select>

          {regions.length > 1 && (
            <select
              value={region}
              onChange={e => setRegion(e.target.value)}
              className={`flex-1 sm:flex-none bg-secondary border rounded-md px-3 py-2.5 sm:py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring touch-manipulation transition-colors ${
                region ? 'border-primary/60 text-foreground' : 'border-border text-muted-foreground'
              }`}
            >
              <option value="">{t('allRegions')}</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}

          <button
            onClick={() => setFavOnly(v => !v)}
            className={`flex-1 sm:flex-none px-3 py-2.5 sm:py-1.5 text-sm rounded-md border transition-colors touch-manipulation ${
              favOnly
                ? 'bg-red-600/20 border-red-600/40 text-red-400'
                : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('favorites')}
          </button>

          {/* Loaded / total counter */}
          <span className="text-sm text-muted-foreground whitespace-nowrap sm:ml-auto">
            {isLoadingInitial ? '…' : `${games.length}/${total}`}
          </span>
        </div>
      </div>

      {/* Empty state — only when not loading */}
      {!isLoadingInitial && games.length === 0 && skeletonCount === 0 && (
        <EmptyState />
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-4">
        {games.map(g => (
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

        {/* Skeleton cards — initial load or appending more */}
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <SkeletonCard
            key={`sk-${i}`}
            thumbnailWidth={thumbnailWidth}
            thumbnailHeight={thumbnailHeight}
          />
        ))}
      </div>

      {/* Sentinel div — IntersectionObserver triggers next page here */}
      <div ref={sentinelRef} className="h-2 mt-4" />

      {/* End-of-list message */}
      {!hasMore && games.length > 0 && !isValidating && (
        <p className="text-center text-xs text-muted-foreground/50 py-6">
          {games.length} {games.length === 1 ? 'juego' : 'juegos'}
        </p>
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
