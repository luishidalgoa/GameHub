'use client'

import { useRef, useState } from 'react'
import { Box, Loader2, Upload, X } from 'lucide-react'
import { resolveCoverPath } from '@/lib/cover-url'
import { getPlatformIdentity } from '@/lib/platform-identity'
import type { ConsoleHandle } from '@/lib/console-scene'
import { AdminButton } from '@/components/admin/AdminButton'

interface Props {
  platformId: number
  slug:       string
  iconPath:   string | null | undefined
  onChange:   (iconPath: string | null) => void
  label:      string
  hint:       string
  removeLabel: string
  /** GLB del modelo 3D de la plataforma; si lo hay, el icono se puede sacar de su fotograma frontal. */
  modelUrl?:    string | null
  /** Póster generado desde el 3D: es también el icono del menú cuando existe. */
  posterPath?:  string | null
  onPosterChange?: () => void
  /** Orientación guardada en Modelos 3D, o la de fábrica. */
  orientation?: [number, number, number] | null
  fromModelLabel?: string
}

/**
 * Compact per-platform icon control for SettingsForm: shows the current icon (or
 * the emoji fallback), uploads a PNG/SVG, can take the icon from the front of the
 * platform's 3D model, and removes it. POSTs to /api/admin/platforms/icon (multipart)
 * and DELETEs to remove.
 */
export function PlatformIconUploader({ platformId, slug, iconPath, onChange, label, hint, removeLabel, modelUrl, posterPath, onPosterChange, orientation, fromModelLabel }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const resolved = resolveCoverPath(posterPath ?? iconPath)

  const send = async (file: Blob | File) => {
    const form = new FormData()
    form.append('platformId', String(platformId))
    form.append('file', file, file instanceof File ? file.name : `${slug}.png`)
    const res = await fetch('/api/admin/platforms/icon', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    if (res.ok) onChange(data.iconPath ?? null)
    else alert(data.error ?? 'Upload failed')
  }

  const upload = async (file: File) => {
    setBusy(true)
    try {
      await send(file)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const fromModel = async () => {
    if (!modelUrl) return
    setBusy(true)
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:512px;height:512px;pointer-events:none'
    document.body.appendChild(host)
    let handle: ConsoleHandle | null = null
    try {
      const { mountConsole } = await import('@/lib/console-scene')
      handle = await mountConsole(host, { url: modelUrl, baseRotation: orientation ?? undefined, axes: false })
      const png = await handle.snapshot(512)
      const form = new FormData()
      form.append('platformId', String(platformId))
      form.append('file', png, `${slug}.png`)
      const res = await fetch('/api/admin/consoles/poster', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (res.ok) onPosterChange?.()
      else alert(data.error ?? 'No se pudo guardar el póster')
    } catch {
      alert('No se pudo generar el póster desde el modelo')
    } finally {
      handle?.dispose()
      host.remove()
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/platforms/icon', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platformId }),
      })
      if (res.ok) onChange(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Preview */}
      <div className="w-10 h-10 rounded-md bg-secondary border border-border flex items-center justify-center overflow-hidden flex-shrink-0">
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : resolved ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={resolved} alt="" className="w-full h-full object-contain" />
        ) : (
          <span className="text-lg select-none">{getPlatformIdentity(slug).emoji}</span>
        )}
      </div>

      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <AdminButton
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <Upload className="w-3 h-3" />
            {label}
          </AdminButton>
          {modelUrl && (
            <AdminButton
              variant="secondary"
              size="sm"
              type="button"
              onClick={fromModel}
              disabled={busy}
            >
              <Box className="w-3 h-3" />
              {fromModelLabel ?? 'Desde el 3D'}
            </AdminButton>
          )}
          {resolved && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="inline-flex items-center gap-1 px-1.5 py-1 text-xs rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
              title={removeLabel}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground/60 leading-tight">{hint}</span>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/svg+xml,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f) }}
      />
    </div>
  )
}
