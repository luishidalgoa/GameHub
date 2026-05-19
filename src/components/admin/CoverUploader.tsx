'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Upload, Link as LinkIcon, Loader2, Crop, Search, ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react'
import { CoverAdjustModal } from './CoverAdjustModal'

interface Props {
  gameId: number
  gameTitle?: string
  currentCover: string | null
  onUploaded: (path: string) => void
  thumbnailWidth?: number
  thumbnailHeight?: number
}

interface RawgResult {
  id: number
  slug?: string
  title: string
  coverUrl?: string
  releaseYear?: number
}

interface SgdbGame   { id: number; name: string }
interface SgdbCover  { url: string; thumb: string; style: string }

export function CoverUploader({ gameId, gameTitle = '', currentCover, onUploaded, thumbnailWidth = 200, thumbnailHeight = 300 }: Props) {
  const t = useTranslations('CoverUploader')
  const [urlInput, setUrlInput]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [preview, setPreview]     = useState(currentCover)
  const [adjusting, setAdjusting] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  // Panel state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTab, setSearchTab]   = useState<'rawg' | 'sgdb'>('sgdb')

  // RAWG tab
  const [rawgQuery, setRawgQuery]     = useState('')
  const [rawgSearching, setRawgSearching] = useState(false)
  const [rawgResults, setRawgResults] = useState<RawgResult[]>([])
  const [applyingRawg, setApplyingRawg] = useState<number | null>(null)

  // SteamGridDB tab — two-step: game search → cover picker
  const [sgdbQuery, setSgdbQuery]       = useState(gameTitle)
  const [sgdbSearching, setSgdbSearching] = useState(false)
  const [sgdbGames, setSgdbGames]       = useState<SgdbGame[]>([])
  const [sgdbError, setSgdbError]       = useState('')
  const [sgdbSelected, setSgdbSelected] = useState<SgdbGame | null>(null)
  const [sgdbCovers, setSgdbCovers]     = useState<SgdbCover[]>([])
  const [sgdbLoadingCovers, setSgdbLoadingCovers] = useState(false)
  const [applyingSgdb, setApplyingSgdb] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)

  // ── Upload helpers ─────────────────────────────────────────────────────────

  const uploadFile = async (file: File, adjusted = false) => {
    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('gameId', String(gameId))
      form.append('file', file)
      if (adjusted) form.append('adjusted', 'true')
      const res  = await fetch('/api/covers', { method: 'POST', body: form })
      const data = await res.json()
      setLoading(false)
      if (res.ok) {
        // Use resolved URL for the preview; pass S3 key to parent so the
        // game editor stores the stable key (not a full URL) in the DB.
        setPreview(data.coverPath + `?t=${Date.now()}`)
        onUploaded(data.key ?? data.coverPath)
      } else setError(data.error || 'Upload failed')
    } catch (err) {
      setLoading(false)
      const msg = err instanceof Error ? err.message : 'Network error'
      setError(msg)
      console.error('Upload error:', err)
    }
  }

  const uploadFromUrl = async (url: string) => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/covers', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ gameId, url }),
      })
      const data = await res.json()
      setLoading(false)
      if (res.ok) {
        setPreview(data.coverPath + `?t=${Date.now()}`)
        onUploaded(data.key ?? data.coverPath)
        setUrlInput('')
        setSearchOpen(false)
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
      if (file) { e.preventDefault(); uploadFile(file) }
    }
    document.addEventListener('paste', handler)
    return () => document.removeEventListener('paste', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setError(null)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) uploadFile(file)
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

  const handleAdjustedSave = async (blob: Blob) => {
    setAdjusting(false)
    await uploadFile(
      new File([blob], `cover_${gameId}_adjusted.webp`, { type: 'image/webp' }),
      true, // adjusted = true → preserve original in MinIO
    )
  }

  // ── RAWG cover search ──────────────────────────────────────────────────────

  const doRawgSearch = async (q: string) => {
    if (!q.trim()) return
    setRawgSearching(true)
    setRawgResults([])
    const res  = await fetch(`/api/metadata/${gameId}?q=${encodeURIComponent(q.trim())}`)
    const data = await res.json()
    setRawgSearching(false)
    if (res.ok) setRawgResults((data.results ?? []).filter((r: RawgResult) => r.coverUrl))
  }

  const applyRawgCover = async (result: RawgResult) => {
    if (!result.coverUrl) return
    setApplyingRawg(result.id)
    await uploadFromUrl(result.coverUrl)
    setApplyingRawg(null)
  }

  // ── SteamGridDB ────────────────────────────────────────────────────────────

  const doSgdbSearch = async (q: string) => {
    if (!q.trim()) return
    setSgdbSearching(true)
    setSgdbGames([])
    setSgdbError('')
    setSgdbSelected(null)
    setSgdbCovers([])
    const res  = await fetch(`/api/covers/steamgriddb?q=${encodeURIComponent(q.trim())}`)
    const data = await res.json()
    setSgdbSearching(false)
    if (!res.ok) setSgdbError(data.message ?? data.error ?? 'Search failed')
    else setSgdbGames(data.games ?? [])
  }

  const loadSgdbCovers = async (game: SgdbGame) => {
    setSgdbSelected(game)
    setSgdbLoadingCovers(true)
    setSgdbCovers([])
    const res  = await fetch(`/api/covers/steamgriddb?gameId=${game.id}`)
    const data = await res.json()
    setSgdbLoadingCovers(false)
    if (res.ok) setSgdbCovers(data.covers ?? [])
  }

  const applySgdbCover = async (thumb: string, url: string) => {
    setApplyingSgdb(url)
    await uploadFromUrl(url)
    setApplyingSgdb(null)
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
        style={{ aspectRatio: `${thumbnailWidth}/${thumbnailHeight}` }}
        className="relative w-full rounded-lg overflow-hidden bg-secondary border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer"
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
        onChange={(e) => { setError(null); const f = e.target.files?.[0]; if (f) uploadFile(f) }}
      />

      {preview && !loading && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setAdjusting(true) }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-secondary border border-border rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        >
          <Crop className="w-4 h-4" />
          {t('adjustCrop')}
        </button>
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
        <button
          type="button"
          onClick={() => uploadFromUrl(urlInput.trim())}
          disabled={loading || !urlInput.trim()}
          className="px-3 py-1.5 bg-secondary border border-border rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-50"
        >
          {t('use')}
        </button>
      </div>

      {/* Search panel */}
      <div className="border border-border rounded-md overflow-hidden">
        <button
          type="button"
          onClick={() => setSearchOpen((o) => !o)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <span className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5" />
            {t('searchCovers')}
          </span>
          {searchOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {searchOpen && (
          <div className="border-t border-border bg-secondary/30">

            {/* Tabs */}
            <div className="flex border-b border-border">
              {(['sgdb', 'rawg'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSearchTab(tab)}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                    searchTab === tab
                      ? 'text-foreground border-b-2 border-primary -mb-px bg-secondary/50'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab === 'sgdb' ? 'SteamGridDB' : 'RAWG'}
                </button>
              ))}
            </div>

            <div className="p-3 space-y-3">

              {/* ── SteamGridDB tab ───────────────────────────────────── */}
              {searchTab === 'sgdb' && (
                <>
                  {/* Step 1 or step 2 header */}
                  {sgdbSelected ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { setSgdbSelected(null); setSgdbCovers([]) }}
                        className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-medium text-foreground truncate">{sgdbSelected.name}</span>
                    </div>
                  ) : (
                    <form
                      onSubmit={(e) => { e.preventDefault(); doSgdbSearch(sgdbQuery) }}
                      className="flex gap-2"
                    >
                      <input
                        type="text"
                        value={sgdbQuery}
                        onChange={(e) => setSgdbQuery(e.target.value)}
                        placeholder={t('gameTitlePlaceholder')}
                        className="flex-1 bg-secondary border border-border rounded-md px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button
                        type="submit"
                        disabled={sgdbSearching || !sgdbQuery.trim()}
                        className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {sgdbSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      </button>
                    </form>
                  )}

                  {sgdbError && (
                    <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">
                      {sgdbError}
                    </p>
                  )}

                  {/* Step 1: game list */}
                  {!sgdbSelected && !sgdbSearching && sgdbGames.length > 0 && (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {sgdbGames.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => loadSgdbCovers(g)}
                          className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-foreground/80 hover:text-foreground flex items-center justify-between group"
                        >
                          <span className="truncate">{g.name}</span>
                          <span className="text-xs text-muted-foreground group-hover:text-foreground ml-2 flex-shrink-0">{t('coversArrow')}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {sgdbSearching && (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  {!sgdbSearching && !sgdbError && sgdbGames.length === 0 && sgdbQuery && !sgdbSelected && (
                    <p className="text-xs text-muted-foreground text-center py-3">{t('noGames')}</p>
                  )}

                  {/* Step 2: cover grid */}
                  {sgdbSelected && (
                    <>
                      {sgdbLoadingCovers && (
                        <div className="flex justify-center py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      {!sgdbLoadingCovers && sgdbCovers.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-3">{t('noCoversForGame')}</p>
                      )}
                      {sgdbCovers.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                          {sgdbCovers.map((c) => (
                            <button
                              key={c.url}
                              type="button"
                              onClick={() => applySgdbCover(c.thumb, c.url)}
                              disabled={applyingSgdb === c.url || loading}
                              className="relative group aspect-[2/3] rounded overflow-hidden bg-secondary border border-border hover:border-primary transition-colors disabled:opacity-60"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={c.thumb} alt="" className="w-full h-full object-cover" />
                              {applyingSgdb === c.url ? (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                                </div>
                              ) : (
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <span className="text-white text-xs font-medium">{t('use')}</span>
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* ── RAWG tab ──────────────────────────────────────────── */}
              {searchTab === 'rawg' && (
                <>
                  <form
                    onSubmit={(e) => { e.preventDefault(); doRawgSearch(rawgQuery) }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={rawgQuery}
                      onChange={(e) => setRawgQuery(e.target.value)}
                      placeholder="Game title…"
                      className="flex-1 bg-secondary border border-border rounded-md px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      type="submit"
                      disabled={rawgSearching || !rawgQuery.trim()}
                      className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {rawgSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    </button>
                  </form>

                  {rawgSearching && (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  {!rawgSearching && rawgResults.length === 0 && rawgQuery && (
                    <p className="text-xs text-muted-foreground text-center py-3">{t('noCovers')}</p>
                  )}

                  {rawgResults.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                      {rawgResults.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => applyRawgCover(r)}
                          disabled={applyingRawg === r.id || loading}
                          className="relative group aspect-[2/3] rounded overflow-hidden bg-secondary border border-border hover:border-primary transition-colors disabled:opacity-60"
                          title={r.title}
                        >
                          <Image src={r.coverUrl!} alt={r.title} fill className="object-cover" unoptimized />
                          {applyingRawg === r.id ? (
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
                </>
              )}

            </div>
          </div>
        )}
      </div>

      {adjusting && preview && (
        <CoverAdjustModal
          src={getOriginalCoverUrl(preview)}
          onSave={handleAdjustedSave}
          onClose={() => setAdjusting(false)}
          thumbnailWidth={thumbnailWidth}
          thumbnailHeight={thumbnailHeight}
        />
      )}
    </div>
  )
}
