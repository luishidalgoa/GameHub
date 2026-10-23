'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, Loader2, Search } from 'lucide-react'

interface TrailerResult {
  videoId: string
  title: string
  channel: string
  thumbnail: string
}

interface Props {
  gameTitle: string
  value: string
  inputClassName: string
  onChange: (url: string) => void
}

/**
 * Tráiler: URL de YouTube o búsqueda dentro de YouTube. Lo usan la ficha
 * completa y el panel. La búsqueda arranca con «<título> trailer».
 */
export function TrailerField({ gameTitle, value, inputClassName, onChange }: Props) {
  const t = useTranslations('GameEditor')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(`${gameTitle} trailer`)
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<TrailerResult[]>([])
  const [error, setError] = useState('')

  const search = async (q: string = query) => {
    if (!q.trim()) return
    setSearching(true)
    setError('')
    setResults([])
    const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`)
    const data = await res.json()
    setSearching(false)
    if (!res.ok) setError(data.message ?? data.error ?? 'Search failed')
    else setResults(data.results ?? [])
  }

  const pick = (videoId: string) => {
    onChange(`https://www.youtube.com/watch?v=${videoId}`)
    setOpen(false)
    setResults([])
    setError('')
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClassName}
          placeholder="https://youtube.com/watch?v=…"
        />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 whitespace-nowrap rounded-md border border-border bg-secondary px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Search className="h-4 w-4" />
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex gap-2 border-b border-border p-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(e.currentTarget.value) } }}
              placeholder={t('trailerSearchPlaceholder')}
              className="flex-1 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            <button
              type="button"
              onClick={() => search(query)}
              disabled={searching}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-red-500 disabled:opacity-50"
            >
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {searching && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <div className="m-1 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>
            )}

            {!searching && !error && results.length === 0 && query.trim() && (
              <p className="py-6 text-center text-xs text-muted-foreground">{t('trailerNoResults')}</p>
            )}

            {!searching && !error && results.length === 0 && !query.trim() && (
              <p className="py-6 text-center text-xs text-muted-foreground">{t('trailerSearchHint')}</p>
            )}

            <div className="space-y-1">
              {results.map((r) => (
                <button
                  key={r.videoId}
                  type="button"
                  onClick={() => pick(r.videoId)}
                  className="group flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent"
                >
                  <div className="relative w-28 flex-shrink-0 overflow-hidden rounded bg-secondary" style={{ aspectRatio: '16/9' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.thumbnail} alt={r.title} className="h-full w-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600">
                        <svg className="ml-0.5 h-3 w-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground">{r.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{r.channel}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
