'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWRInfinite from 'swr/infinite'
import { usePathname } from 'next/navigation'
import { GameCard, SkeletonCard } from '@/components/platform/GameCard'
import { GameDetailModal } from '@/components/game/GameDetailModal'
import { EmptyState } from '@/components/shared/EmptyState'
import type { GameListItem } from '@/types/game'

// La rejilla de una plataforma (GameGrid), para las listas de varias plataformas: explorar y
// «recientes». Las tarjetas son flexibles: cada una usa la proporción de su propia caja. Carga
// la página siguiente al llegar al final, sin paginación.

const PAGE_SIZE   = 48   // la página de las colecciones en el servidor
const SENTINEL_PX = 400  // empieza a pedir la siguiente página a 400 px del final

export type CollectionSource =
  | { kind: 'collection'; name: string; platform?: string }
  | { kind: 'ids'; ids: number[] }

type Item = GameListItem & { fileName: string; online?: boolean; source?: string; platformSlug: string }
interface ApiPage { games: Item[]; total: number }

const fetcher = (url: string): Promise<ApiPage> =>
  fetch(url).then(r => { if (!r.ok) throw new Error('fetch failed'); return r.json() })

function urlFor(source: CollectionSource, page: number): string {
  if (source.kind === 'collection') {
    const p = new URLSearchParams({ page: String(page) })
    if (source.platform) p.set('platform', source.platform)
    return `/api/collections/${encodeURIComponent(source.name)}?${p}`
  }
  const ids = source.ids.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  return `/api/games/list?ids=${ids.join(',')}`
}

export function CollectionGrid({ source }: { source: CollectionSource }) {
  const pathname = usePathname()
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // Las props llegan nuevas en cada render cuando la lista es de ids: la clave es su contenido.
  const sourceKey = JSON.stringify(source)
  const stable = useMemo(() => JSON.parse(sourceKey) as CollectionSource, [sourceKey])

  const getKey = useCallback((pageIndex: number, prev: ApiPage | null) => {
    if (stable.kind === 'ids') {
      return pageIndex * PAGE_SIZE >= stable.ids.length ? null : urlFor(stable, pageIndex + 1)
    }
    if (prev && pageIndex * PAGE_SIZE >= prev.total) return null
    return urlFor(stable, pageIndex + 1)
  }, [stable])

  const { data, size, setSize, isValidating, mutate } = useSWRInfinite<ApiPage>(
    getKey,
    fetcher,
    { revalidateFirstPage: false, revalidateOnFocus: false },
  )

  const games = useMemo(() => data?.flatMap(d => d.games) ?? [], [data])
  const total = stable.kind === 'ids' ? stable.ids.length : (data?.[0]?.total ?? 0)
  const hasMore = games.length < total

  const isLoadingInitial = !data && isValidating
  const isLoadingMore    = isValidating && size > (data?.length ?? 0)

  // Sentinela: al entrar en pantalla pide la página siguiente.
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !isValidating) setSize(s => s + 1)
      },
      { rootMargin: `${SENTINEL_PX}px` },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore, isValidating, setSize])

  // Favorito: el mismo cambio optimista que la rejilla de la plataforma.
  const handleToggleFavorite = useCallback(async (id: number, current: boolean) => {
    await fetch(`/api/games/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ isFavorite: !current }),
    })
    mutate(
      pages => pages?.map(page => ({
        ...page,
        games: page.games.map(g => g.id === id ? { ...g, isFavorite: !current } : g),
      })),
      { revalidate: false },
    )
  }, [mutate])

  const skeletonCount = isLoadingInitial ? PAGE_SIZE / 2 : isLoadingMore ? PAGE_SIZE / 4 : 0

  return (
    <div>
      <div className="mb-4 text-sm text-muted-foreground tabular-nums">
        {isLoadingInitial ? '…' : `${games.length}/${total}`}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-4 items-start">
        {games.map((g, i) => (
          <div key={g.id}>
            <GameCard
              game={g}
              onSelect={setSelectedId}
              onToggleFavorite={handleToggleFavorite}
              isAdmin={false}
              platformSlug={g.platformSlug}
              returnTo={pathname}
              animateIndex={i < PAGE_SIZE / 2 ? i : undefined}
            />
          </div>
        ))}
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div key={`sk-${i}`}>
            <SkeletonCard />
          </div>
        ))}
      </div>

      <div ref={sentinelRef} className="h-2 mt-4" />

      {!hasMore && games.length > 0 && !isValidating && (
        <p className="text-center text-xs text-muted-foreground/50 py-6">
          {games.length} {games.length === 1 ? 'juego' : 'juegos'}
        </p>
      )}

      {games.length === 0 && !isLoadingInitial && (
        <EmptyState />
      )}

      {selectedId !== null && (
        <GameDetailModal
          gameId={selectedId}
          onClose={() => setSelectedId(null)}
          returnTo={pathname}
        />
      )}
    </div>
  )
}
