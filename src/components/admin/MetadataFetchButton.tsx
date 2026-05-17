'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Sparkles, X, Check, Loader2, Search, Link2 } from 'lucide-react'
import type { MetadataResult } from '@/lib/metadata/provider'

interface Props {
  gameId: number
  onApplied: () => void
}

function extractSlug(input: string): string | null {
  const trimmed = input.trim()
  const urlMatch = trimmed.match(/rawg\.io\/games\/([a-z0-9-]+)/i)
  if (urlMatch) return urlMatch[1].toLowerCase()
  if (/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(trimmed) && trimmed.includes('-')) return trimmed.toLowerCase()
  return null
}

export function MetadataFetchButton({ gameId, onApplied }: Props) {
  const t = useTranslations('MetadataFetch')
  const [open, setOpen]           = useState(false)
  const [loading, setLoading]     = useState(false)
  const [applying, setApplying]   = useState<number | null>(null)
  const [results, setResults]     = useState<MetadataResult[]>([])
  const [error, setError]         = useState('')
  const [usedQuery, setUsedQuery] = useState('')
  const [searchMode, setSearchMode] = useState<'search' | 'slug'>('search')
  const [manualQuery, setManualQuery] = useState('')

  const doSearch = async (overrideQ?: string) => {
    setLoading(true)
    setError('')
    setResults([])

    const slug   = overrideQ ? extractSlug(overrideQ) : null
    const apiUrl = slug
      ? `/api/metadata/${gameId}?slug=${encodeURIComponent(slug)}`
      : overrideQ
        ? `/api/metadata/${gameId}?q=${encodeURIComponent(overrideQ)}`
        : `/api/metadata/${gameId}`

    const res  = await fetch(apiUrl)
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Search failed')
    } else {
      setResults(data.results ?? [])
      setUsedQuery(data.usedQuery ?? overrideQ ?? '')
      setSearchMode(data.mode ?? 'search')
    }
    setLoading(false)
  }

  const search = () => { setOpen(true); doSearch() }

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualQuery.trim()) doSearch(manualQuery.trim())
  }

  const apply = async (result: MetadataResult) => {
    setApplying(result.id)
    const body = result.slug ? { rawgSlug: result.slug } : { rawgId: result.id }
    const res  = await fetch(`/api/metadata/${gameId}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    setApplying(null)
    if (res.ok) { setOpen(false); onApplied() }
    else {
      const d = await res.json()
      setError(d.error ?? 'Apply failed')
    }
  }

  const isSlug = manualQuery ? !!extractSlug(manualQuery) : false

  return (
    <>
      <button
        type="button"
        onClick={search}
        className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-md text-sm font-medium transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        {t('button')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

          <div className="relative z-10 bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">

            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold">{t('modalTitle')}</h3>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualSearch} className="px-4 pt-3 pb-2 flex gap-2">
              <div className="relative flex-1">
                {isSlug
                  ? <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-violet-400 pointer-events-none" />
                  : <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                }
                <input
                  type="text"
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !manualQuery.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isSlug ? <Link2 className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
                {isSlug ? t('lookup') : t('search')}
              </button>
            </form>

            {isSlug && (
              <p className="px-5 pb-1 text-xs text-violet-400 flex items-center gap-1.5">
                <Link2 className="w-3 h-3" /> {t('slugHint')}
              </p>
            )}
            {usedQuery && !loading && (
              <p className="px-5 pb-1 text-xs text-muted-foreground">
                {searchMode === 'slug' ? t('slugLabel') : t('resultsFor')}{' '}
                <span className="text-foreground/70 font-medium">"{usedQuery}"</span>
              </p>
            )}

            <div className="flex-1 overflow-y-auto p-4 pt-2">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="ml-3 text-sm text-muted-foreground">{t('searching')}</span>
                </div>
              )}

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
                  {error}
                </div>
              )}

              {!loading && !error && results.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-12 space-y-2">
                  <p>{t('noResults')}</p>
                  <p className="text-xs">
                    {t('noResultsHint')}<br />
                    <span className="font-mono text-muted-foreground/60">rawg.io/games/pokemon-x</span>
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => apply(r)}
                    disabled={applying === r.id}
                    className="w-full flex items-center gap-4 p-3 rounded-lg hover:bg-accent transition-colors text-left disabled:opacity-50 group"
                  >
                    <div className="w-12 h-16 flex-shrink-0 rounded overflow-hidden bg-secondary">
                      {r.coverUrl ? (
                        <Image src={r.coverUrl} alt={r.title} width={48} height={64} className="object-cover w-full h-full" unoptimized />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/40 text-xl font-bold">
                          {r.title.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{r.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {r.releaseYear && <span className="text-xs text-muted-foreground">{r.releaseYear}</span>}
                        {r.slug && <span className="text-xs text-muted-foreground/50 font-mono">{r.slug}</span>}
                      </div>
                    </div>
                    {applying === r.id
                      ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 text-muted-foreground" />
                      : <Check className="w-4 h-4 flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    }
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
