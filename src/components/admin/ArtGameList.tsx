'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GameImagesPanel } from './GameImagesPanel'

export interface ArtGameRow {
  id: number
  title: string
  platform: string
  missing: 'fanart' | 'logo' | 'ambos'
}

/** The games still missing art, one per row. Each opens its art in a side panel, over the list. */
export function ArtGameList({ rows, emptyText }: { rows: ArtGameRow[]; emptyText: string }) {
  const [openId, setOpenId] = useState<number | null>(null)
  const open = rows.find(r => r.id === openId) ?? null

  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">{emptyText}</p>

  return (
    <>
      <ul className="divide-y divide-border">
        {rows.map(r => (
          <li key={r.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
            <span className="min-w-0">
              <span className="font-medium truncate block">{r.title}</span>
              <span className="text-xs text-muted-foreground">{r.platform} · falta {r.missing === 'fanart' ? 'fondo' : r.missing === 'logo' ? 'logo' : 'fondo o logo'}</span>
            </span>
            <button
              type="button"
              onClick={() => setOpenId(r.id)}
              className="px-3 py-1.5 rounded-md text-xs bg-secondary hover:bg-secondary/80 flex-shrink-0"
            >
              Editar arte
            </button>
          </li>
        ))}
      </ul>
      {open && <ArtSidePanel key={open.id} row={open} onClose={() => setOpenId(null)} />}
    </>
  )
}

function ArtSidePanel({ row, onClose }: { row: ArtGameRow; onClose: () => void }) {
  const router = useRouter()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Handing a field back to the automatic flows: the same PATCH the sheet uses.
  const release = async (field: string) => {
    await fetch(`/api/games/${row.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unlock: [field] }) })
    router.refresh()
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
            onCover={() => router.refresh()}
            thumbnailWidth={200}
            thumbnailHeight={300}
            onRelease={release}
          />
        </div>
      </aside>
    </div>
  )
}
