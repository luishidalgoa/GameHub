'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GameImagesPanel } from './GameImagesPanel'
import { useInfinitePages } from './useInfinitePages'
import { AdminButton } from '@/components/admin/AdminButton'

export interface ArtGameRow {
  id: number
  title: string
  platform: string
  missing: 'fanart' | 'logo'
  box: { width: number; height: number; altWidth: number | null; altHeight: number | null }
}

/**
 * The games still missing art, one per row, loaded as the reader scrolls. Each opens its
 * art in a side panel, over the list. `query` is the art filter, without the page.
 */
export function ArtGameList({ query, emptyText }: { query: string; emptyText: string }) {
  const router = useRouter()
  const [openId, setOpenId] = useState<number | null>(null)
  const { items: rows, total, hasMore, isLoading, isValidating, failed, mutate, sentinelRef } = useInfinitePages<ArtGameRow>({
    url: '/api/admin/arte/list',
    query,
  })
  const open = rows.find(r => r.id === openId) ?? null
  const close = () => { setOpenId(null); mutate() }

  return (
    <>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">{total === null ? 'Cargando…' : `${total.toLocaleString('es-ES')} juegos con estos filtros`}</span>
        {isValidating && rows.length > 0 && <span>Cargando más…</span>}
      </div>

      {failed && (
        <p className="py-6 text-center text-sm text-destructive">
          No se pudo cargar la lista. <button type="button" onClick={() => mutate()} className="underline hover:text-foreground">Reintentar</button>
        </p>
      )}
      {!isLoading && !failed && rows.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">{emptyText}</p>
      )}
      {rows.length > 0 && (
        <ul className="grid grid-cols-1 gap-x-7 gap-y-0.5 lg:grid-cols-2">
          {rows.map(r => (
            <li key={r.id} className="flex items-center gap-3 rounded-md px-2.5 py-2 text-sm hover:bg-secondary/40">
              <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
              <span className={`shrink-0 text-xs ${r.missing === 'fanart' ? 'text-red-300' : 'text-amber-300'}`}>
                {r.missing === 'fanart' ? 'falta fondo' : 'falta logo'}
              </span>
              <span className="w-28 shrink-0 text-right text-xs text-muted-foreground truncate">{r.platform}</span>
              <AdminButton
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setOpenId(r.id)}
                aria-label={`Editar arte de ${r.title}`}
                className="flex-shrink-0"
              >
                Editar arte
              </AdminButton>
            </li>
          ))}
        </ul>
      )}
      <div ref={sentinelRef} className="h-2" aria-hidden="true" />
      {!hasMore && rows.length > 0 && (
        <p className="py-2 text-center text-xs text-muted-foreground">Fin de la lista · {rows.length.toLocaleString('es-ES')} de {(total ?? 0).toLocaleString('es-ES')}</p>
      )}

      {open && <ArtSidePanel key={open.id} row={open} onClose={close} onChanged={() => { mutate(); router.refresh() }} />}
    </>
  )
}

function ArtSidePanel({ row, onClose, onChanged }: { row: ArtGameRow; onClose: () => void; onChanged: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Handing a field back to the automatic flows: the same PATCH the sheet uses.
  const release = async (field: string) => {
    await fetch(`/api/games/${row.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unlock: [field] }) })
    onChanged()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div aria-hidden="true" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-labelledby="art-panel-title" className="relative w-full max-w-3xl h-full bg-card border-l border-border overflow-y-auto">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-card border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2 id="art-panel-title" className="text-lg font-semibold truncate">{row.title}</h2>
            <p className="text-sm text-muted-foreground">
              {row.platform} · <a href={`/admin/games/${row.id}`} className="text-primary hover:underline">Abrir ficha completa</a>
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="p-2 rounded-md hover:bg-accent text-muted-foreground">×</button>
        </header>
        <div className="p-6">
          <GameImagesPanel
            panel
            gameId={row.id}
            gameTitle={row.title}
            coverPath={null}
            onCover={onChanged}
            thumbnailWidth={row.box.width}
            thumbnailHeight={row.box.height}
            altThumbnailWidth={row.box.altWidth}
            altThumbnailHeight={row.box.altHeight}
            onRelease={release}
          />
        </div>
      </aside>
    </div>
  )
}
