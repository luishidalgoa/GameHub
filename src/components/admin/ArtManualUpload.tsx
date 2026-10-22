'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, RefreshCw, X } from 'lucide-react'

export interface ArtUploadRow {
  id: number
  title: string
  platform: string
  /** The game's cover, for telling games apart at a glance. */
  coverUrl: string | null
  /** The art that is missing: the upload fills it. */
  missing: 'fanart' | 'logo'
}

const LABEL: Record<ArtUploadRow['missing'], string> = { fanart: 'fondo', logo: 'logo' }

/**
 * Subida manual de arte (#142). Se elige la imagen, se ve antes de subirla junto a la
 * carátula del juego, y solo se sube al confirmar. Usa la misma ruta que la ficha.
 */
export function ArtManualUpload({ rows }: { rows: ArtUploadRow[] }) {
  const router = useRouter()
  const [pending, setPending] = useState<{ row: ArtUploadRow; file: File; preview: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  // Free the preview's object URL when it changes or the row goes away.
  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.preview) }, [pending])

  function choose(row: ArtUploadRow, file: File) {
    setMessage(null)
    setPending({ row, file, preview: URL.createObjectURL(file) })
  }

  async function confirm() {
    if (!pending) return
    setBusy(true)
    try {
      const form = new FormData()
      form.append('kind', pending.row.missing)
      form.append('file', pending.file)
      const res = await fetch(`/api/admin/games/${pending.row.id}/art`, { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? String(res.status))
      setMessage({ ok: true, text: `«${pending.row.title}»: ${LABEL[pending.row.missing]} guardado. Lo puedes quitar en la lista de abajo.` })
      setPending(null)
      router.refresh()
    } catch (err) {
      setMessage({ ok: false, text: `No se pudo subir: ${err instanceof Error ? err.message : 'error'}` })
    } finally {
      setBusy(false)
    }
  }

  if (rows.length === 0 && !message) {
    return <p className="text-sm text-muted-foreground">Ningún juego valioso (con descripción o año) se queda sin fondo o sin logo.</p>
  }

  return (
    <div className="space-y-4">
      {message && <p className={`text-sm ${message.ok ? 'text-green-500' : 'text-destructive'}`}>{message.text}</p>}

      {pending && (
        <div className="border border-border rounded-lg p-4 flex flex-wrap items-center gap-4">
          <img src={pending.preview} alt="" className="h-24 max-w-[260px] object-contain rounded-md bg-secondary" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{pending.row.title}</p>
            <p className="text-xs text-muted-foreground">{pending.row.platform} · se guardará como {LABEL[pending.row.missing]}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setPending(null)} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-secondary hover:bg-secondary/80">
              <X className="w-3.5 h-3.5" /> Cancelar
            </button>
            <button onClick={confirm} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-60">
              {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Subir
            </button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-border">
        {rows.map(row => (
          <li key={`${row.id}-${row.missing}`} className="py-3 flex items-center gap-4">
            <div className="w-16 h-16 flex-shrink-0 rounded-md bg-secondary overflow-hidden">
              {row.coverUrl && <img src={row.coverUrl} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{row.title}</p>
              <p className="text-xs text-muted-foreground">{row.platform} · falta {LABEL[row.missing]}</p>
            </div>
            <label className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer bg-secondary hover:bg-secondary/80">
              <Upload className="w-3.5 h-3.5" /> Elegir {LABEL[row.missing]}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={busy}
                onChange={e => { const f = e.target.files?.[0]; if (f) choose(row, f); e.target.value = '' }}
              />
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
