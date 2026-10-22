'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, RefreshCw } from 'lucide-react'

export interface ManualArtRow {
  imageId: number
  gameId: number
  title: string
  platform: string
  kind: 'fanart' | 'banner' | 'logo'
  imageUrl: string | null
  createdAt: string
}

const KIND: Record<ManualArtRow['kind'], string> = { fanart: 'Fondo', banner: 'Banner', logo: 'Logo' }

/** Imágenes que subiste a mano, con miniatura, para revisarlas y quitarlas (#142). */
export function ManualArtList({ rows }: { rows: ManualArtRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function remove(row: ManualArtRow) {
    if (!window.confirm(`¿Quitar ${KIND[row.kind].toLowerCase()} de «${row.title}»? El juego vuelve a como estaba sin ella.`)) return
    setBusy(row.imageId)
    setError(null)
    setDone(null)
    try {
      const res = await fetch(`/api/admin/games/${row.gameId}/art?imageId=${row.imageId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(String(res.status))
      setDone(`Quitado: «${row.title}» vuelve a como estaba. La imagen se borra del almacén.`)
      router.refresh()
    } catch {
      setError(`No se pudo quitar la imagen de «${row.title}».`)
    } finally {
      setBusy(null)
    }
  }

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No has subido ninguna imagen a mano.</p>

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {done && <p role="status" className="text-sm text-green-500">{done}</p>}
      <ul className="divide-y divide-border">
        {rows.map(row => (
          <li key={row.imageId} className="py-3 flex items-center gap-4">
            <div className="w-24 h-14 flex-shrink-0 rounded-md bg-secondary overflow-hidden flex items-center justify-center">
              {row.imageUrl
                ? <img
                    src={row.imageUrl}
                    alt={`${KIND[row.kind]} de ${row.title}`}
                    className={row.kind === 'logo' ? 'w-full h-full object-contain bg-[repeating-conic-gradient(#1c1c24_0%_25%,#15151b_0%_50%)] bg-[length:12px_12px]' : 'w-full h-full object-cover'}
                  />
                : <span className="text-xs text-muted-foreground">sin vista</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{row.title}</p>
              <p className="text-xs text-muted-foreground">{row.platform} · {KIND[row.kind]} · {new Date(row.createdAt).toLocaleString('es-ES')}</p>
            </div>
            <button
              onClick={() => remove(row)}
              disabled={busy !== null}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-secondary hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50 transition-colors"
            >
              {busy === row.imageId ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Quitar
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
