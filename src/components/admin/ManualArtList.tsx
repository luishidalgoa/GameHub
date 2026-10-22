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
  /** Set for an image removed a moment ago, while it can still be restored. */
  removedAt: string | null
}

const KIND: Record<ManualArtRow['kind'], string> = { fanart: 'Fondo', banner: 'Banner', logo: 'Logo' }
const CHECKER = 'bg-[repeating-conic-gradient(#1c1c24_0%_25%,#15151b_0%_50%)] bg-[length:12px_12px]'

function minutesLeft(removedAt: string): number {
  const end = new Date(removedAt).getTime() + 10 * 60 * 1000
  return Math.max(0, Math.ceil((end - Date.now()) / 60000))
}

/** Subidas a mano (#142): las activas con «Quitar», y las quitadas hace poco con «Deshacer». */
export function ManualArtList({ rows }: { rows: ManualArtRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const active = rows.filter(r => !r.removedAt)
  const removed = rows.filter(r => r.removedAt)

  async function remove(row: ManualArtRow) {
    if (!window.confirm(`¿Quitar ${KIND[row.kind].toLowerCase()} de «${row.title}»? El juego vuelve a como estaba. Podrás deshacerlo unos 10 minutos.`)) return
    await call(row, 'DELETE', `Quitado: «${row.title}» vuelve a como estaba. Puedes deshacerlo unos 10 minutos.`)
  }

  async function restore(row: ManualArtRow) {
    await call(row, 'POST', `Restaurado: «${row.title}» vuelve a tener su ${KIND[row.kind].toLowerCase()}.`, 'restore')
  }

  async function call(row: ManualArtRow, method: 'DELETE' | 'POST', ok: string, action = '') {
    setBusy(row.imageId)
    setError(null)
    setDone(null)
    try {
      const path = action ? `/api/admin/games/${row.gameId}/art/${action}` : `/api/admin/games/${row.gameId}/art`
      const res = await fetch(`${path}?imageId=${row.imageId}`, { method })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? String(res.status))
      setDone(ok)
      router.refresh()
    } catch (err) {
      setError(`No se pudo completar en «${row.title}»: ${err instanceof Error ? err.message : 'error'}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {done && <p role="status" className="text-sm text-green-500">{done}</p>}

      {active.length === 0 && removed.length === 0 && (
        <p className="text-sm text-muted-foreground">No has subido ninguna imagen a mano.</p>
      )}

      {active.length > 0 && (
        <ul className="divide-y divide-border">
          {active.map(row => (
            <li key={row.imageId} className="py-3 flex items-center gap-4">
              <Thumb row={row} />
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate" title={row.title}>{row.title}</p>
                <p className="text-xs text-muted-foreground">{row.platform} · {KIND[row.kind]} · {new Date(row.createdAt).toLocaleString('es-ES')}</p>
              </div>
              <button
                type="button"
                onClick={() => remove(row)}
                disabled={busy !== null}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-secondary hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50 transition-colors"
              >
                {busy === row.imageId ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      {removed.length > 0 && (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">Quitadas hace poco. Se borran del almacén al cumplirse el plazo.</p>
          <ul className="divide-y divide-border">
            {removed.map(row => (
              <li key={row.imageId} className="py-3 flex items-center gap-4 opacity-80">
                <Thumb row={row} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate" title={row.title}>{row.title}</p>
                  <p className="text-xs text-muted-foreground">{row.platform} · {KIND[row.kind]} · quedan {minutesLeft(row.removedAt!)} min</p>
                </div>
                <button
                  type="button"
                  onClick={() => restore(row)}
                  disabled={busy !== null}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50"
                >
                  {busy === row.imageId && <RefreshCw className="w-4 h-4 animate-spin" />}
                  Deshacer
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Thumb({ row }: { row: ManualArtRow }) {
  return (
    <div className="w-24 h-14 flex-shrink-0 rounded-md bg-secondary overflow-hidden flex items-center justify-center">
      {row.imageUrl
        ? <img
            src={row.imageUrl}
            alt={`${KIND[row.kind]} de ${row.title}`}
            className={row.kind === 'logo' ? `w-full h-full object-contain ${CHECKER}` : 'w-full h-full object-cover'}
          />
        : <span className="text-xs text-muted-foreground">sin vista</span>}
    </div>
  )
}
