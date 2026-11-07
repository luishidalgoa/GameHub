'use client'

import { useState, useRef, useEffect } from 'react'
import type { CoverFrame } from '@/lib/cover-frame'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Upload, Link as LinkIcon, Loader2, Crop } from 'lucide-react'
import { CoverAdjustModal } from './CoverAdjustModal'
import { AdminButton } from '@/components/admin/AdminButton'
import { resolveCoverPath } from '@/lib/cover-url'
import { coverShapeOf } from '@/lib/cover-shape'
import type { FieldSource, MetadataSources } from '@/lib/metadata/sources'
import { isCoverSource } from '@/lib/metadata/sources'
import { ImageSearch } from '@/components/admin/ImageSearch'

interface Props {
  gameId: number
  gameTitle?: string
  /** Platform slug of the game. Decides whether the libretro tab is offered at
   *  all: that archive is indexed per system and simply has no Switch set. */
  platformSlug?: string
  currentCover: string | null
  /** Frame of the last crop of the current cover, or null when it is not cropped. */
  coverFrame?: CoverFrame | null
  /** `sources` is the updated provenance the server stored, so the editor's
   *  cover badge can follow the picture without a page reload. */
  onUploaded: (path: string, sources?: MetadataSources, frame?: CoverFrame | null) => void
  thumbnailWidth?: number
  thumbnailHeight?: number
  /** The platform's secondary box, when it has one: a cover of that shape is shown in it, whole. */
  altThumbnailWidth?: number | null
  altThumbnailHeight?: number | null
  /** The proportion of the stored cover, when known (the editor measures it on load otherwise). */
  coverRatio?: number | null
}

export function CoverUploader({ gameId, gameTitle = '', platformSlug, currentCover, coverFrame = null, onUploaded, thumbnailWidth = 200, thumbnailHeight = 300, altThumbnailWidth = null, altThumbnailHeight = null, coverRatio = null }: Props) {
  const t = useTranslations('CoverUploader')
  const [urlInput, setUrlInput]   = useState('')
  const [loading, setLoading]     = useState(false)
  // currentCover is the raw stored value (an S3 key like "covers/switch/1.webp").
  // Resolve it to the proxy URL for display — otherwise the browser treats it as
  // a relative path (e.g. /admin/games/123/covers/…) and 404s.
  const [preview, setPreview]     = useState<string | null>(() => resolveCoverPath(currentCover))
  // The stored cover's own proportion: from the game, then measured when the picture loads (a new cover
  // has no stored ratio here yet). It decides whether the cover is a secondary-box cover, shown whole.
  const [shownRatio, setShownRatio] = useState<number | null>(coverRatio)
  const coverShape = preview && shownRatio != null
    ? coverShapeOf(shownRatio, { thumbnailWidth, thumbnailHeight, altThumbnailWidth, altThumbnailHeight })
    : { ratio: thumbnailWidth / thumbnailHeight, whole: false }
  // The parent can change the cover on its own (another save, a refresh of the
  // game): the preview follows the stored cover instead of keeping the old one.
  useEffect(() => { setPreview(resolveCoverPath(currentCover)) }, [currentCover])
  // The frame of the last crop: the next crop starts from it.
  const [frame, setFrame] = useState<CoverFrame | null>(coverFrame)
  useEffect(() => { setFrame(coverFrame) }, [coverFrame])
  const [adjusting, setAdjusting] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)

  // ── Upload helpers ─────────────────────────────────────────────────────────

  // `source` records where the image came from. A crop adjustment passes none:
  // it re-uploads the same artwork, so the stored provenance must survive.
  const uploadFile = async (file: File, adjusted = false, source?: FieldSource, cropFrame?: CoverFrame) => {
    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('gameId', String(gameId))
      form.append('file', file)
      if (adjusted) form.append('adjusted', 'true')
      if (source) form.append('source', source)
      if (cropFrame) form.append('frame', JSON.stringify(cropFrame))
      const res  = await fetch('/api/covers', { method: 'POST', body: form })
      const data = await res.json()
      setLoading(false)
      if (res.ok) {
        // Use resolved URL for the preview; pass S3 key to parent so the
        // game editor stores the stable key (not a full URL) in the DB.
        setPreview(data.coverPath + `?t=${Date.now()}`)
        // The server keeps the frame only for a crop; any other picture has none.
        const saved: CoverFrame | null = adjusted ? (data.coverFrame ?? null) : null
        setFrame(saved)
        onUploaded(data.key ?? data.coverPath, data.sources, saved)
      } else setError(data.error || 'Upload failed')
    } catch (err) {
      setLoading(false)
      const msg = err instanceof Error ? err.message : 'Network error'
      setError(msg)
      console.error('Upload error:', err)
    }
  }

  const uploadFromUrl = async (url: string, source: FieldSource = 'url') => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/covers', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ gameId, url, source }),
      })
      const data = await res.json()
      setLoading(false)
      if (res.ok) {
        setPreview(data.coverPath + `?t=${Date.now()}`)
        setFrame(null)
        onUploaded(data.key ?? data.coverPath, data.sources, null)
        setUrlInput('')
      }
      else setError(data.error || 'Upload failed')
    } catch (err) {
      setLoading(false)
      const msg = err instanceof Error ? err.message : 'Network error'
      setError(msg)
      console.error('Upload error:', err)
    }
  }

  // ── Clipboard paste ────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      const items   = Array.from(e.clipboardData?.items ?? [])
      const imgItem = items.find((i) => i.type.startsWith('image/'))
      if (!imgItem) return
      const file = imgItem.getAsFile()
      if (file) { e.preventDefault(); uploadFile(file, false, 'upload') }
    }
    document.addEventListener('paste', handler)
    return () => document.removeEventListener('paste', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setError(null)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) uploadFile(file, false, 'upload')
  }

  const getOriginalCoverUrl = (path: string) => {
    // Strip any ?t=… cache-buster, then replace .webp → .original.webp
    const base = path.split('?')[0].replace(/\.webp$/, '.original.webp')
    // If the path is already a proxy URL just keep it as-is (relative)
    // If it's a full MinIO URL convert it to the proxy URL
    if (base.startsWith('http://') || base.startsWith('https://')) {
      // Extract the key portion after the bucket name
      const match = base.match(/\/covers\/.*$/)
      if (match) return `/api/covers/proxy${match[0]}?t=${Date.now()}`
    }
    return `${base}?t=${Date.now()}`
  }

  const handleAdjustedSave = async (blob: Blob, cropFrame: CoverFrame) => {
    setAdjusting(false)
    await uploadFile(
      new File([blob], `cover_${gameId}_adjusted.webp`, { type: 'image/webp' }),
      true, // adjusted = true → preserve original in MinIO
      undefined,
      cropFrame,
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">

      {/* Error message */}
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          <p className="font-medium">Upload failed:</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      )}
      <div
        style={{ aspectRatio: String(coverShape.ratio) }}
        className="relative w-full max-w-[240px] rounded-lg overflow-hidden bg-secondary border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
      >
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : preview ? (
          <>
            <Image
              src={preview}
              alt="Cover"
              fill
              className={coverShape.whole ? 'object-contain' : 'object-cover'}
              unoptimized
              onLoad={(e) => {
                const img = e.currentTarget
                if (img.naturalWidth && img.naturalHeight) setShownRatio(img.naturalWidth / img.naturalHeight)
              }}
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
              <p className="text-white text-sm font-medium">{t('clickOrDrop')}</p>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-1">
            <Upload className="w-8 h-8 mb-1" />
            <p className="text-sm">{t('dropHint')}</p>
            <p className="text-xs opacity-60">{t('pasteHint')}</p>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { setError(null); const f = e.target.files?.[0]; if (f) uploadFile(f, false, 'upload') }}
      />

      {preview && !loading && (
        <AdminButton
          type="button"
          variant="secondary"
          size="md"
          onClick={(e) => { e.stopPropagation(); setAdjusting(true) }}
          className="w-full"
        >
          <Crop className="w-4 h-4" />
          {t('adjustCrop')}
        </AdminButton>
      )}

      {/* URL input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <LinkIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="url"
            placeholder={t('urlPlaceholder')}
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); uploadFromUrl(urlInput.trim()) } }}
            className="w-full bg-secondary border border-border rounded-md pl-8 pr-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <AdminButton
          type="button"
          variant="primary"
          size="md"
          onClick={() => uploadFromUrl(urlInput.trim())}
          disabled={loading || !urlInput.trim()}
        >
          {t('use')}
        </AdminButton>
      </div>

      <ImageSearch
        slot="cover"
        gameId={gameId}
        gameTitle={gameTitle}
        platformSlug={platformSlug ?? ''}
        onPick={(url, source) => uploadFromUrl(url, isCoverSource(source) ? source : 'url')}
      />

      {adjusting && preview && (
        <CoverAdjustModal
          src={getOriginalCoverUrl(preview)}
          onSave={handleAdjustedSave}
          onClose={() => setAdjusting(false)}
          initialFrame={frame}
          thumbnailWidth={thumbnailWidth}
          thumbnailHeight={thumbnailHeight}
        />
      )}
    </div>
  )
}
