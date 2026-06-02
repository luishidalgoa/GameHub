'use client'

import { useRef, useState } from 'react'
import { Loader2, Upload, X } from 'lucide-react'
import { resolveCoverPath } from '@/lib/cover-url'
import { getPlatformIdentity } from '@/lib/platform-identity'

interface Props {
  platformId: number
  slug:       string
  iconPath:   string | null | undefined
  onChange:   (iconPath: string | null) => void
  label:      string
  hint:       string
  removeLabel: string
}

/**
 * Compact per-platform icon control for SettingsForm: shows the current icon (or
 * the emoji fallback), lets the admin upload a PNG/SVG, and remove it. POSTs to
 * /api/admin/platforms/icon (multipart) and DELETEs to remove.
 */
export function PlatformIconUploader({ platformId, slug, iconPath, onChange, label, hint, removeLabel }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const resolved = resolveCoverPath(iconPath)

  const upload = async (file: File) => {
    setBusy(true)
    try {
      const form = new FormData()
      form.append('platformId', String(platformId))
      form.append('file', file)
      const res = await fetch('/api/admin/platforms/icon', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (res.ok) onChange(data.iconPath ?? null)
      else alert(data.error ?? 'Upload failed')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
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
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-secondary border border-border hover:bg-accent transition-colors disabled:opacity-50"
          >
            <Upload className="w-3 h-3" />
            {label}
          </button>
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
