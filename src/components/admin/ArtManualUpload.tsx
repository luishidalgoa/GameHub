'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, RefreshCw } from 'lucide-react'

export interface ArtUploadRow {
  id: number
  title: string
  platform: string
  /** The art that is missing: the upload fills it. */
  missing: 'fanart' | 'logo'
}

const LABEL: Record<ArtUploadRow['missing'], string> = { fanart: 'Fondo', logo: 'Logo' }

/**
 * Subida manual de arte desde la pantalla de Arte (#142). Usa la misma ruta que la
 * ficha del juego: el fichero se convierte a WebP y el campo de arte del juego apunta a él.
 */
export function ArtManualUpload({ rows }: { rows: ArtUploadRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<number | null>(null)
  const [message, setMessage] = useState<{ id: number; text: string; ok: boolean } | null>(null)
  const inputs = useRef<Record<number, HTMLInputElement | null>>({})

  async function upload(row: ArtUploadRow, file: File) {
    setBusy(row.id)
    setMessage(null)
    try {
      const form = new FormData()
      form.append('kind', row.missing)
      form.append('file', file)
      const res = await fetch(`/api/admin/games/${row.id}/art`, { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? String(res.status))
      setMessage({ id: row.id, text: `${LABEL[row.missing]} guardado.`, ok: true })
      router.refresh()
    } catch (err) {
      setMessage({ id: row.id, text: `No se pudo subir: ${err instanceof Error ? err.message : 'error'}`, ok: false })
    } finally {
      setBusy(null)
      const input = inputs.current[row.id]
      if (input) input.value = ''
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Todos los juegos visibles tienen fondo y logo.</p>
  }

  return (
    <ul className="divide-y divide-border text-sm">
      {rows.map(row => (
        <li key={`${row.id}-${row.missing}`} className="py-2 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="font-medium">{row.title}</span>
            <span className="ml-2 text-xs text-muted-foreground">{row.platform} · falta {LABEL[row.missing].toLowerCase()}</span>
            {message?.id === row.id && (
              <p className={`text-xs mt-0.5 ${message.ok ? 'text-green-500' : 'text-destructive'}`}>{message.text}</p>
            )}
          </div>
          <label className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${busy === row.id ? 'opacity-60 pointer-events-none bg-secondary' : 'bg-secondary hover:bg-secondary/80'}`}>
            {busy === row.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Subir {LABEL[row.missing].toLowerCase()}
            <input
              ref={el => { inputs.current[row.id] = el }}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) upload(row, f) }}
            />
          </label>
        </li>
      ))}
    </ul>
  )
}
