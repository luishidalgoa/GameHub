'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, Loader2, ArrowLeft, Heart, EyeOff, Search, ChevronDown, ImageIcon } from 'lucide-react'
import useSWR from 'swr'
import { CoverUploader } from './CoverUploader'
import { MetadataFetchButton } from './MetadataFetchButton'
import { ScreenshotCarousel } from '@/components/game/ScreenshotCarousel'
import type { Game } from '@/types/game'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Props {
  game: Game
  thumbnailWidth?: number
  thumbnailHeight?: number
}

export function GameEditorForm({ game, thumbnailWidth = 200, thumbnailHeight = 300 }: Props) {
  const router = useRouter()
  const t = useTranslations('GameEditor')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [coverPath, setCoverPath] = useState(game.coverPath)
  const [searchOpen, setSearchOpen] = useState(false)
  const [trailerSearching, setTrailerSearching] = useState(false)
  const [trailerSearchQuery, setTrailerSearchQuery] = useState(`${game.title} trailer`)
  const [trailerResults, setTrailerResults] = useState<Array<{ videoId: string; title: string; channel: string; thumbnail: string }>>([])
  const [trailerError, setTrailerError] = useState('')

  // Screenshots from RAWG (only when game has been matched)
  const { data: ssData } = useSWR<{ screenshots: string[] }>(
    game.rawgSlug ? `/api/games/${game.id}/screenshots` : null,
    fetcher,
  )
  const screenshots = ssData?.screenshots ?? []
  const [settingCover, setSettingCover] = useState<string | null>(null)

  const useCoverFromScreenshot = async (url: string) => {
    setSettingCover(url)
    try {
      const res = await fetch('/api/covers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.id, url }),
      })
      if (res.ok) {
        const data = await res.json()
        setCoverPath(data.coverPath)
      }
    } finally {
      setSettingCover(null)
    }
  }

  const [form, setForm] = useState({
    title: game.title ?? '',
    description: game.description ?? '',
    customNotes: game.customNotes ?? '',
    genre: game.genre ?? '',
    region: game.region ?? '',
    releaseYear: game.releaseYear ? String(game.releaseYear) : '',
    developer: game.developer ?? '',
    publisher: game.publisher ?? '',
    trailerUrl: game.trailerUrl ?? '',
    isFavorite: game.isFavorite,
    isHidden: game.isHidden,
  })

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const searchTrailers = async (query: string = trailerSearchQuery) => {
    if (!query.trim()) return
    setTrailerSearching(true)
    setTrailerError('')
    setTrailerResults([])
    const res  = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`)
    const data = await res.json()
    setTrailerSearching(false)
    if (!res.ok) {
      setTrailerError(data.message ?? data.error ?? 'Search failed')
    } else {
      setTrailerResults(data.results ?? [])
    }
  }

  const selectTrailer = (videoId: string) => {
    set('trailerUrl', `https://www.youtube.com/watch?v=${videoId}`)
    setSearchOpen(false)
    setTrailerResults([])
    setTrailerError('')
  }

  const save = async () => {
    setSaving(true)
    await fetch(`/api/games/${game.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        releaseYear: form.releaseYear ? parseInt(form.releaseYear, 10) : null,
        coverPath,
      }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  const handleMetadataApplied = () => {
    // Refresh page to get updated data
    router.refresh()
    window.location.reload()
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-semibold">{game.title}</h2>
            <p className="text-sm text-muted-foreground">{game.platform?.name} · {game.fileName}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <MetadataFetchButton gameId={game.id} onApplied={handleMetadataApplied} />
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saved ? t('saved') : saving ? t('saving') : t('saveChanges')}
          </button>
        </div>
      </div>

      {/* Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: main form (2/3) */}
        <div className="lg:col-span-2 space-y-5">
          <Field label={t('fieldTitle')}>
            <input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label={t('fieldDescription')}>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={6}
              className={`${inputCls} resize-y`}
            />
          </Field>

          <Field label={t('fieldCustomNotes')}>
            <textarea
              value={form.customNotes}
              onChange={(e) => set('customNotes', e.target.value)}
              rows={4}
              placeholder={t('fieldCustomNotesPlaceholder')}
              className={`${inputCls} resize-y`}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('fieldGenre')}>
              <input value={form.genre} onChange={(e) => set('genre', e.target.value)} className={inputCls} placeholder={t('fieldGenrePlaceholder')} />
            </Field>
            <Field label={t('fieldRegion')}>
              <input value={form.region} onChange={(e) => set('region', e.target.value)} className={inputCls} placeholder={t('fieldRegionPlaceholder')} />
            </Field>
            <Field label={t('fieldYear')}>
              <input value={form.releaseYear} onChange={(e) => set('releaseYear', e.target.value)} className={inputCls} type="number" min="1970" max="2030" />
            </Field>
            <Field label={t('fieldDeveloper')}>
              <input value={form.developer} onChange={(e) => set('developer', e.target.value)} className={inputCls} />
            </Field>
            <Field label={t('fieldPublisher')} className="col-span-2">
              <input value={form.publisher} onChange={(e) => set('publisher', e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label={t('fieldTrailer')}>
            <div className="relative">
              <div className="flex gap-2">
                <input
                  value={form.trailerUrl}
                  onChange={(e) => set('trailerUrl', e.target.value)}
                  className={inputCls}
                  placeholder="https://youtube.com/watch?v=…"
                />
                <button
                  type="button"
                  onClick={() => setSearchOpen(!searchOpen)}
                  className="flex items-center gap-1 px-3 py-2 bg-secondary border border-border rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground whitespace-nowrap"
                >
                  <Search className="w-4 h-4" />
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>

              {searchOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-2xl z-20 overflow-hidden">
                  {/* Search bar */}
                  <div className="flex gap-2 p-3 border-b border-border">
                    <input
                      value={trailerSearchQuery}
                      onChange={(e) => setTrailerSearchQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchTrailers(e.currentTarget.value) } }}
                      placeholder={t('trailerSearchPlaceholder')}
                      className="flex-1 bg-secondary border border-border rounded-md px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => searchTrailers(trailerSearchQuery)}
                      disabled={trailerSearching}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-md text-sm disabled:opacity-50 transition-colors"
                    >
                      {trailerSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Results */}
                  <div className="max-h-80 overflow-y-auto p-2">
                    {trailerSearching && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    )}

                    {trailerError && (
                      <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2 m-1">
                        {trailerError.includes('Configure') ? (
                          <>{trailerError}</>
                        ) : trailerError}
                      </div>
                    )}

                    {!trailerSearching && !trailerError && trailerResults.length === 0 && trailerSearchQuery.trim() && (
                      <p className="text-xs text-muted-foreground text-center py-6">{t('trailerNoResults')}</p>
                    )}

                    {!trailerSearching && !trailerError && trailerResults.length === 0 && !trailerSearchQuery.trim() && (
                      <p className="text-xs text-muted-foreground text-center py-6">{t('trailerSearchHint')}</p>
                    )}

                    <div className="space-y-1">
                      {trailerResults.map((r) => (
                        <button
                          key={r.videoId}
                          type="button"
                          onClick={() => selectTrailer(r.videoId)}
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors text-left group"
                        >
                          {/* Thumbnail */}
                          <div className="relative flex-shrink-0 w-28 rounded overflow-hidden bg-secondary" style={{ aspectRatio: '16/9' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={r.thumbnail} alt={r.title} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                              <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center">
                                <svg className="w-3 h-3 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>
                          </div>
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">{r.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{r.channel}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Field>

          {form.trailerUrl && (
            <TrailerPreview url={form.trailerUrl} />
          )}

          {/* RAWG Screenshots */}
          {screenshots.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                {t('screenshots')}
                <span className="text-xs text-muted-foreground font-normal">— {t('screenshotsHint')}</span>
              </p>
              <div
                className="flex gap-2 overflow-x-auto pb-1"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {screenshots.map((src, i) => (
                  <div key={i} className="relative shrink-0 group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`Screenshot ${i + 1}`}
                      className="h-24 w-auto rounded-lg object-cover"
                    />
                    {/* "Use as cover" overlay */}
                    <button
                      type="button"
                      onClick={() => useCoverFromScreenshot(src)}
                      disabled={settingCover !== null}
                      className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 group-hover:bg-black/60 transition-colors"
                    >
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-semibold text-white text-center leading-tight px-1.5">
                        {settingCover === src
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : t('screenshotsUseCover')}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* File path (read-only) */}
          <div className="bg-secondary/50 rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">{t('filePath')}</p>
            <p className="text-xs font-mono text-muted-foreground/70 break-all">{game.filePath}</p>
          </div>
        </div>

        {/* Right: cover + flags (1/3) */}
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium mb-3">{t('coverArt')}</p>
            <CoverUploader
              gameId={game.id}
              gameTitle={game.title}
              currentCover={coverPath}
              onUploaded={(path) => setCoverPath(path)}
              thumbnailWidth={thumbnailWidth}
              thumbnailHeight={thumbnailHeight}
            />
          </div>

          {/* Flags */}
          <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide text-xs">{t('flags')}</p>

            <Toggle
              icon={<Heart className="w-4 h-4" />}
              label={t('favorite')}
              onLabel={t('on')}
              offLabel={t('off')}
              value={form.isFavorite}
              onChange={(v) => set('isFavorite', v)}
              activeClass="text-red-400"
            />
            <Toggle
              icon={<EyeOff className="w-4 h-4" />}
              label={t('hidden')}
              onLabel={t('on')}
              offLabel={t('off')}
              value={form.isHidden}
              onChange={(v) => set('isHidden', v)}
              activeClass="text-amber-400"
            />
          </div>

          {/* Metadata info */}
          {game.metadataFetchedAt && (
            <div className="text-xs text-muted-foreground">
              {t('metadataFetched')} {new Date(game.metadataFetchedAt).toLocaleDateString()}
              {game.rawgSlug && (
                <span className="ml-1 text-muted-foreground/50">· RAWG: {game.rawgSlug}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'

function Field({
  label,
  children,
  className = '',
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function Toggle({
  icon,
  label,
  onLabel,
  offLabel,
  value,
  onChange,
  activeClass,
}: {
  icon: React.ReactNode
  label: string
  onLabel: string
  offLabel: string
  value: boolean
  onChange: (v: boolean) => void
  activeClass: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
        value ? `bg-accent ${activeClass}` : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      }`}
    >
      {icon}
      <span>{label}</span>
      <span className={`ml-auto text-xs ${value ? '' : 'opacity-50'}`}>{value ? onLabel : offLabel}</span>
    </button>
  )
}

function TrailerPreview({ url }: { url: string }) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/)
  const videoId = m?.[1]
  if (!videoId) return null

  return (
    <div className="aspect-video rounded-lg overflow-hidden">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        className="w-full h-full"
        allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      />
    </div>
  )
}
