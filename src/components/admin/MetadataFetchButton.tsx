'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Sparkles, X, Check, Loader2, Search, Link2 } from 'lucide-react'
import type { MetadataResult } from '@/lib/metadata/provider'

interface Props {
  gameId: number
  onApplied: () => void
}

// ── Slug detection helpers ────────────────────────────────────────────────────

/**
 * Returns the RAWG slug if the input looks like a slug or a rawg.io URL.
 * Accepts:
 *   - "pokemon-x"
 *   - "https://rawg.io/games/pokemon-x"
 *   - "rawg.io/games/pokemon-x"
 */
function extractSlug(input: string): string | null {
  const trimmed = input.trim()

  // Full rawg.io URL
  const urlMatch = trimmed.match(/rawg\.io\/games\/([a-z0-9-]+)/i)
  if (urlMatch) return urlMatch[1].toLowerCase()

  // Plain slug: only lowercase letters, digits and hyphens, no spaces
  if (/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(trimmed) && trimmed.includes('-')) {
    return trimmed.toLowerCase()
  }

  return null
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MetadataFetchButton({ gameId, onApplied }: Props) {
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState<number | string | null>(null)
  const [results, setResults]   = useState<MetadataResult[]>([])
  const [error, setError]       = useState('')
  const [usedQuery, setUsedQuery] = useState('')
  const [searchMode, setSearchMode] = useState<'search' | 'slug'>('search')
  const [manualQuery, setManualQuery] = useState('')

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const doSearch = async (overrideQ?: string) => {
    setLoading(true)
    setError('')
    setResults([])

    // Detect if the override looks like a slug or rawg.io URL
    const slug = overrideQ ? extractSlug(overrideQ) : null
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

  // ── Apply ──────────────────────────────────────────────────────────────────

  const apply = async (rawgId: number, rawgSlug?: string) => {
    const key = rawgSlug ?? rawgId
    setApplying(key)

    const res = await fetch(`/api/metadata/${gameId}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      // Prefer slug lookup (more stable than numeric ID across RAWG migrations)
      body: JSON.stringify(rawgSlug ? { rawgSlug } : { rawgId }),
    })
    setApplying(null)

    if (res.ok) {
      setOpen(false)
      onApplied()
    } else {
      const d = await res.json()
      setError(d.error ?? 'Apply failed')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const isSlug = manualQuery ? !!extractSlug(manualQuery) : false

  return (
    <>
      <button
        type="button"
        onClick={search}
        className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-md text-sm font-medium transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        Auto-fill from RAWG
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

          <div className="relative z-10 bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold">Select Metadata Source</h3>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search bar */}
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
                  placeholder="Search title or paste rawg.io/games/slug…"
                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !manualQuery.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isSlug ? <Link2 className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
                {isSlug ? 'Lookup' : 'Search'}
              </button>
            </form>

            {/* Slug hint */}
            {isSlug && (
              <p className="px-5 pb-1 text-xs text-violet-400 flex items-center gap-1.5">
                <Link2 className="w-3 h-3" />
                Direct lookup by RAWG slug — bypasses search ranking
              </p>
            )}

            {/* Query indicator */}
            {usedQuery && !loading && (
              <p className="px-5 pb-1 text-xs text-muted-foreground">
                {searchMode === 'slug' ? 'Slug:' : 'Results for:'}{' '}
                <span className="text-foreground/70 font-medium">"{usedQuery}"</span>
              </p>
            )}

            {/* Results */}
            <div className="flex-1 overflow-y-auto p-4 pt-2">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="ml-3 text-sm text-muted-foreground">
                    {isSlug ? 'Fetching by slug…' : 'Searching RAWG…'}
                  </span>
                </div>
              )}

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
                  {error}
                </div>
              )}

              {!loading && !error && results.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-12 space-y-2">
                  <p>No results found.</p>
                  <p className="text-xs">
                    Try pasting the RAWG URL directly:<br />
                    <span className="font-mono text-muted-foreground/60">rawg.io/games/pokemon-x</span>
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {results.map((r) => {
                  const key = r.slug ?? r.id
                  return (
                    <button
                      key={r.id}
                      onClick={() => apply(r.id, r.slug)}
                      disabled={applying === key}
                      className="w-full flex items-center gap-4 p-3 rounded-lg hover:bg-accent transition-colors text-left disabled:opacity-50 group"
                    >
                      <div className="w-12 h-16 flex-shrink-0 rounded overflow-hidden bg-secondary">
                        {r.coverUrl ? (
                          <Image src={r.coverUrl} alt={r.title} width={48} height={64} className="object-cover w-full h-full" />
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

                      {applying === key
                        ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 text-muted-foreground" />
                        : <Check className="w-4 h-4 flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      }
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
