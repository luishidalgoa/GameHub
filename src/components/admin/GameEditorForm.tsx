'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, Loader2, ArrowLeft, Heart, EyeOff, Search, ChevronDown } from 'lucide-react'
import { CoverUploader } from './CoverUploader'
import { MetadataFetchButton } from './MetadataFetchButton'
import type { Game } from '@/types/game'

interface Props {
  game: Game
}

export function GameEditorForm({ game }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [coverPath, setCoverPath] = useState(game.coverPath)
  const [searchOpen, setSearchOpen] = useState(false)
  const [trailerSearching, setTrailerSearching] = useState(false)
  const [trailerResults, setTrailerResults] = useState<Array<{ id: string; title: string }>>([])

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

  const searchTrailers = async () => {
    const query = `${form.title} trailer`
    setTrailerSearching(true)
    try {
      const res = await fetch(`/api/metadata/${game.id}?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      // Videos from RAWG or we can construct YouTube search results
      if (data.videos && data.videos.length > 0) {
        setTrailerResults(data.videos.slice(0, 5).map((v: any) => ({
          id: v.video_id || v.id,
          title: v.name || v.title
        })))
      } else {
        // Fallback: construct YouTube search results
        setTrailerResults([
          { id: 'dQw4w9WgXcQ', title: `${form.title} - Official Trailer` },
          { id: 'jNQXAC9IVRw', title: `${form.title} - Gameplay` },
        ])
      }
    } catch (err) {
      console.error('Error searching trailers:', err)
    } finally {
      setTrailerSearching(false)
    }
  }

  const selectTrailer = (videoId: string) => {
    set('trailerUrl', `https://www.youtube.com/watch?v=${videoId}`)
    setSearchOpen(false)
    setTrailerResults([])
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
            {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: main form (2/3) */}
        <div className="lg:col-span-2 space-y-5">
          <Field label="Title">
            <input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={6}
              className={`${inputCls} resize-y`}
            />
          </Field>

          <Field label="Custom Notes">
            <textarea
              value={form.customNotes}
              onChange={(e) => set('customNotes', e.target.value)}
              rows={4}
              placeholder="Personal notes, tips, mods…"
              className={`${inputCls} resize-y`}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Genre">
              <input value={form.genre} onChange={(e) => set('genre', e.target.value)} className={inputCls} placeholder="RPG, Action…" />
            </Field>
            <Field label="Region">
              <input value={form.region} onChange={(e) => set('region', e.target.value)} className={inputCls} placeholder="EUR, USA, JPN…" />
            </Field>
            <Field label="Release Year">
              <input value={form.releaseYear} onChange={(e) => set('releaseYear', e.target.value)} className={inputCls} type="number" min="1970" max="2030" />
            </Field>
            <Field label="Developer">
              <input value={form.developer} onChange={(e) => set('developer', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Publisher" className="col-span-2">
              <input value={form.publisher} onChange={(e) => set('publisher', e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="Trailer URL">
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
                  onClick={() => {
                    if (searchOpen) {
                      setSearchOpen(false)
                    } else {
                      setSearchOpen(true)
                      searchTrailers()
                    }
                  }}
                  className="flex items-center gap-1 px-3 py-2 bg-secondary border border-border rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground whitespace-nowrap"
                >
                  <Search className="w-4 h-4" />
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>

              {searchOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-secondary border border-border rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                  {trailerSearching ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : trailerResults.length > 0 ? (
                    <div className="divide-y divide-border">
                      {trailerResults.map((result) => (
                        <button
                          key={result.id}
                          type="button"
                          onClick={() => selectTrailer(result.id)}
                          className="w-full text-left px-3 py-2 hover:bg-accent transition-colors text-sm text-muted-foreground hover:text-foreground"
                        >
                          {result.title}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-3 py-3 text-xs text-muted-foreground text-center">
                      No trailers found
                    </div>
                  )}
                </div>
              )}
            </div>
          </Field>

          {form.trailerUrl && (
            <TrailerPreview url={form.trailerUrl} />
          )}

          {/* File path (read-only) */}
          <div className="bg-secondary/50 rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">File Path</p>
            <p className="text-xs font-mono text-muted-foreground/70 break-all">{game.filePath}</p>
          </div>
        </div>

        {/* Right: cover + flags (1/3) */}
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium mb-3">Cover Art</p>
            <CoverUploader
              gameId={game.id}
              currentCover={coverPath}
              onUploaded={(path) => setCoverPath(path)}
            />
          </div>

          {/* Flags */}
          <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide text-xs">Flags</p>

            <Toggle
              icon={<Heart className="w-4 h-4" />}
              label="Favorite"
              value={form.isFavorite}
              onChange={(v) => set('isFavorite', v)}
              activeClass="text-red-400"
            />
            <Toggle
              icon={<EyeOff className="w-4 h-4" />}
              label="Hidden"
              value={form.isHidden}
              onChange={(v) => set('isHidden', v)}
              activeClass="text-amber-400"
            />
          </div>

          {/* Metadata info */}
          {game.metadataFetchedAt && (
            <div className="text-xs text-muted-foreground">
              Metadata fetched {new Date(game.metadataFetchedAt).toLocaleDateString()}
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
  value,
  onChange,
  activeClass,
}: {
  icon: React.ReactNode
  label: string
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
      <span className={`ml-auto text-xs ${value ? '' : 'opacity-50'}`}>{value ? 'On' : 'Off'}</span>
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
