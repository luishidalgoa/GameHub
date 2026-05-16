'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { Upload, Link as LinkIcon, Loader2, Crop, Search, ChevronDown, ChevronUp } from 'lucide-react'
import { CoverAdjustModal } from './CoverAdjustModal'

interface Props {
  gameId: number
  currentCover: string | null
  onUploaded: (path: string) => void
}

interface SearchResult {
  id: number
  slug?: string
  title: string
  coverUrl?: string
  releaseYear?: number
}

export function CoverUploader({ gameId, currentCover, onUploaded }: Props) {
  const [urlInput, setUrlInput]       = useState('')
  const [loading, setLoading]         = useState(false)
  const [preview, setPreview]         = useState(currentCover)
  const [adjusting, setAdjusting]     = useState(false)

  // Cover search state
  const [searchOpen, setSearchOpen]   = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching]     = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [applying, setApplying]       = useState<number | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)

  // ── Upload helpers ─────────────────────────────────────────────────────────

  const uploadFile = async (file: File) => {
    setLoading(true)
    const form = new FormData()
    form.append('gameId', String(gameId))
    form.append('file', file)

    const res  = await fetch('/api/covers', { method: 'POST', body: form })
    const data = await res.json()
    setLoading(false)

    if (res.ok) {
      setPreview(data.coverPath + `?t=${Date.now()}`)
      onUploaded(data.coverPath)
    }
  }

  const uploadFromUrl = async (url: string) => {
    setLoading(true)
    const res  = await fetch('/api/covers', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ gameId, url }),
    })
    const data = await res.json()
    setLoading(false)

    if (res.ok) {
      setPreview(data.coverPath + `?t=${Date.now()}`)
      onUploaded(data.coverPath)
      setUrlInput('')
      setSearchOpen(false)
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
      if (file) { e.preventDefault(); uploadFile(file) }
    }
    document.addEventListener('paste', handler)
    return () => document.removeEventListener('paste', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Drop ───────────────────────────────────────────────────────────────────

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) uploadFile(file)
  }

  // ── Adjust / crop ──────────────────────────────────────────────────────────

  const getOriginalCoverUrl = (path: string) => {
    return path.replace('.webp', '.original.webp') + `?t=${Date.now()}`
  }

  const handleAdjustedSave = async (blob: Blob) => {
    setAdjusting(false)
    const file = new File([blob], `cover_${gameId}_adjusted.webp`, { type: 'image/webp' })
    await uploadFile(file)
  }

  // ── Cover search ───────────────────────────────────────────────────────────

  const doSearch = async (q: string) => {
    if (!q.trim()) return
    setSearching(true)
    setSearchResults([])
    const res  = await fetch(`/api/metadata/${gameId}?q=${encodeURIComponent(q.trim())}`)
    const data = await res.json()
    setSearching(false)
    if (res.ok) setSearchResults((data.results ?? []).filter((r: SearchResult) => r.coverUrl))
  }

  const applyCover = async (result: SearchResult) => {
    if (!result.coverUrl) return
    setApplying(result.id)
    await uploadFromUrl(result.coverUrl)
    setApplying(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">

      {/* Preview / drop zone */}
      <div
        className="relative aspect-[2/3] w-full rounded-lg overflow-hidden bg-secondary border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer"
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
            <Image src={preview} alt="Cover" fill className="object-cover" unoptimized />
            <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
              <p className="text-white text-sm font-medium">Click or drop to replace</p>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-1">
            <Upload className="w-8 h-8 mb-1" />
            <p className="text-sm">Drop image or click</p>
            <p className="text-xs opacity-60">or Ctrl+V to paste</p>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f) }}
      />

      {/* Adjust button */}
      {preview && !loading && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setAdjusting(true) }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-secondary border border-border rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        >
          <Crop className="w-4 h-4" />
          Adjust / Crop
        </button>
      )}

      {/* URL input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <LinkIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="url"
            placeholder="Paste image URL…"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); uploadFromUrl(urlInput.trim()) } }}
            className="w-full bg-secondary border border-border rounded-md pl-8 pr-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="button"
          onClick={() => uploadFromUrl(urlInput.trim())}
          disabled={loading || !urlInput.trim()}
          className="px-3 py-1.5 bg-secondary border border-border rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-50"
        >
          Use
        </button>
      </div>

      {/* Cover search panel */}
      <div className="border border-border rounded-md overflow-hidden">
        <button
          type="button"
          onClick={() => setSearchOpen((o) => !o)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <span className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5" />
            Search covers on RAWG
          </span>
          {searchOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {searchOpen && (
          <div className="border-t border-border p-3 space-y-3 bg-secondary/30">
            {/* Search input */}
            <form
              onSubmit={(e) => { e.preventDefault(); doSearch(searchQuery) }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Game title…"
                className="flex-1 bg-secondary border border-border rounded-md px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={searching || !searchQuery.trim()}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              </button>
            </form>

            {/* Results grid */}
            {searching && (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!searching && searchResults.length === 0 && searchQuery && (
              <p className="text-xs text-muted-foreground text-center py-3">No covers found</p>
            )}

            {searchResults.length > 0 && (
              <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => applyCover(r)}
                    disabled={applying === r.id || loading}
                    className="relative group aspect-[2/3] rounded overflow-hidden bg-secondary border border-border hover:border-primary transition-colors disabled:opacity-60"
                    title={`${r.title}${r.releaseYear ? ` (${r.releaseYear})` : ''}`}
                  >
                    <Image
                      src={r.coverUrl!}
                      alt={r.title}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    {applying === r.id ? (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                      </div>
                    ) : (
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1">
                        <p className="text-white text-[10px] leading-tight line-clamp-2">{r.title}</p>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Adjust modal */}
      {adjusting && preview && (
        <CoverAdjustModal
          src={getOriginalCoverUrl(preview)}
          onSave={handleAdjustedSave}
          onClose={() => setAdjusting(false)}
        />
      )}
    </div>
  )
}
