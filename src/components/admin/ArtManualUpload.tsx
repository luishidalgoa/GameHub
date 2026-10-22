'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, RefreshCw } from 'lucide-react'

export interface ArtUploadRow {
  id: number
  title: string
  platform: string
  /** The game's cover, so the admin can tell the games apart at a glance. */
  coverUrl: string | null
  /** The art that is missing: the upload fills it. */
  missing: 'fanart' | 'logo'
}

const LABEL: Record<ArtUploadRow['missing'], string> = { fanart: 'fondo', logo: 'logo' }
const HINT: Record<ArtUploadRow['missing'], string> = {
  fanart: 'Fondo: horizontal, 16:9. Se recorta si no lo es.',
  logo: 'Logo: con fondo transparente, se muestra centrado.',
}

/**
 * Subida manual de arte (#142). Cada fila tiene su botón; la imagen elegida se ve
 * dentro de esa misma fila, con el juego y el tipo, y solo se sube al confirmar.
 */
export function ArtManualUpload({ rows, emptyText }: { rows: ArtUploadRow[]; emptyText: string }) {
  const router = useRouter()
  const [pending, setPending] = useState<{ key: string; row: ArtUploadRow; file: File; preview: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})

  // The preview's object URL lives as long as the preview it belongs to.
  useEffect(() => {
    const url = pending?.preview
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [pending])

  const keyOf = (row: ArtUploadRow) => `${row.id}-${row.missing}`

  function choose(row: ArtUploadRow, file: File) {
    setMessage(null)
    setPending({ key: keyOf(row), row, file, preview: URL.createObjectURL(file) })
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
      setMessage({ ok: true, text: `«${pending.row.title}»: ${LABEL[pending.row.missing]} guardado. Lo puedes quitar en «Subidas a mano».` })
      setPending(null)
      router.refresh()
    } catch (err) {
      setMessage({ ok: false, text: `No se pudo subir: ${err instanceof Error ? err.message : 'error'}` })
    } finally {
      setBusy(false)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        {message && <p role="status" className={`text-sm ${message.ok ? 'text-green-500' : 'text-destructive'}`}>{message.text}</p>}
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {message && <p role="status" className={`text-sm ${message.ok ? 'text-green-500' : 'text-destructive'}`}>{message.text}</p>}

      <ul className="divide-y divide-border">
        {rows.map(row => {
          const key = keyOf(row)
          const isPending = pending?.key === key
          return (
            <li key={key} className={`py-3 flex flex-col gap-3 ${isPending ? 'rounded-lg border border-violet-700/60 bg-violet-950/20 px-3' : ''}`}>
              <div className="flex items-center gap-4">
                <div className="w-16 h-20 flex-shrink-0 rounded-md bg-secondary overflow-hidden">
                  {row.coverUrl && <img src={row.coverUrl} alt={row.title} className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate" title={row.title}>{row.title}</p>
                  <p className="text-xs text-muted-foreground">{row.platform} · falta {LABEL[row.missing]}</p>
                </div>
                {!isPending && (
                  <>
                    <button
                      type="button"
                      onClick={() => inputs.current[key]?.click()}
                      disabled={busy}
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-secondary hover:bg-secondary/80 disabled:opacity-60"
                    >
                      <Upload className="w-4 h-4" /> Elegir {LABEL[row.missing]}
                    </button>
                    <input
                      ref={el => { inputs.current[key] = el }}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      tabIndex={-1}
                      aria-label={`Elegir ${LABEL[row.missing]} para ${row.title}`}
                      onChange={e => { const f = e.target.files?.[0]; if (f) choose(row, f); e.target.value = '' }}
                    />
                  </>
                )}
              </div>

              {isPending && pending && (
                <div className="flex flex-wrap items-center gap-4 pl-20">
                  <div className={`h-28 max-w-[320px] rounded-md flex items-center justify-center ${row.missing === 'logo' ? 'bg-[repeating-conic-gradient(#1c1c24_0%_25%,#15151b_0%_50%)] bg-[length:16px_16px]' : 'bg-secondary'}`}>
                    <img src={pending.preview} alt={`Vista previa de ${LABEL[row.missing]} para ${row.title}`} className="h-full max-w-full object-contain rounded-md" />
                  </div>
                  <div className="flex flex-col gap-2 text-xs text-muted-foreground flex-1 min-w-[200px]">
                    <span>{HINT[row.missing]}</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setPending(null)} disabled={busy} className="px-3 py-2 rounded-md text-sm bg-secondary hover:bg-secondary/80 disabled:opacity-60">
                        Cancelar
                      </button>
                      <button type="button" onClick={confirm} disabled={busy} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-60">
                        {busy && <RefreshCw className="w-4 h-4 animate-spin" />} Subir {LABEL[row.missing]}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
