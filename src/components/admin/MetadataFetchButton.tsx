'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Sparkles, X, Check, Loader2, Search } from 'lucide-react'
import { SOURCE_LABEL, type MetadataSourceId } from '@/lib/providers/catalog'
import { AdminButton } from '@/components/admin/AdminButton'

interface Props {
  gameId: number
  onApplied: () => void
}

// Una fuente de la ficha puede ser cualquier origen (también los manuales: URL, subida…): se muestra por su nombre.
type Source = string
// Un resultado de la búsqueda, tal como lo da el servidor para cualquier fuente de metadatos.
interface Candidate { id: number | string; title: string; source: MetadataSourceId; platform?: string; thumb?: string }
// Las fuentes de metadatos las da el servidor (src/lib/providers/metadata.ts): el modal no lista ninguna a mano.
interface ProviderInfo { id: MetadataSourceId; label: string; available: boolean }
type Sources = Partial<Record<'cover' | 'info' | 'description' | 'screenshots', Source>>

export function MetadataFetchButton({ gameId, onApplied }: Props) {
  const t = useTranslations('MetadataFetch')

  const [filling, setFilling] = useState(false)
  const [summary, setSummary] = useState<Sources | null>(null)
  const [topError, setTopError] = useState('')

  // Manual search modal
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)
  const [results, setResults] = useState<Candidate[]>([])
  const [provider, setProvider] = useState<MetadataSourceId | null>(null)
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  // Provider the admin explicitly forced for the search (null = matrix default).
  const [forcedProvider, setForcedProvider] = useState<MetadataSourceId | null>(null)
  const [error, setError] = useState('')
  const [usedQuery, setUsedQuery] = useState('')
  const [manualQuery, setManualQuery] = useState('')

  // The server answers with machine codes; the admin reads a sentence, never a code.
  const fillErrorText = (code?: string) => {
    if (code === 'store_unavailable') return t('storeUnavailable')
    if (code === 'No confident match found') return t('noMatch')
    if (code === 'rawg_key_rejected') return t('rawgKeyRejected')
    if (code === 'rawg_quota') return t('rawgQuota')
    return t('requestFailed')
  }

  // ── One-click: apply the provider matrix ──
  const fillNow = async () => {
    setFilling(true)
    setTopError('')
    setSummary(null)
    try {
      const res = await fetch(`/api/metadata/${gameId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setTopError(fillErrorText(data.error))
      } else {
        setSummary(data.sources ?? {})
        onApplied()
      }
    } catch {
      setTopError(t('networkError'))
    } finally {
      setFilling(false)
    }
  }

  // ── Manual search (fallback) ──
  // `prov` lets a provider-tab click search that source right away, without
  // waiting for the forcedProvider state update to flush.
  const doSearch = async (q?: string, prov?: MetadataSourceId | null) => {
    setLoading(true)
    setError('')
    setResults([])
    const chosen = prov !== undefined ? prov : forcedProvider
    const qs = new URLSearchParams()
    if (q) qs.set('q', q)
    if (chosen) qs.set('provider', chosen)
    const query = qs.toString()
    try {
      const res = await fetch(`/api/metadata/${gameId}${query ? `?${query}` : ''}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setError(data.error ?? t('searchFailed'))
      else {
        setResults(data.results ?? [])
        setProviders(data.providers ?? [])
        setProvider(data.provider ?? null)
        setUsedQuery(data.usedQuery ?? q ?? '')
      }
    } catch {
      setError(t('networkError'))
    } finally {
      setLoading(false)
    }
  }

  const openManual = () => { setOpen(true); setForcedProvider(null); doSearch(undefined, null) }

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualQuery.trim()) doSearch(manualQuery.trim())
  }

  // Switch which provider serves the results, re-running the current query.
  const pickProvider = (p: MetadataSourceId) => {
    if (p === forcedProvider) return
    setForcedProvider(p)
    doSearch(manualQuery.trim() || undefined, p)
  }

  const applyPick = async (r: Candidate) => {
    setApplying(String(r.id))
    try {
      const res = await fetch(`/api/metadata/${gameId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: r.source, id: r.id }),
      })
      if (res.ok) { setOpen(false); onApplied() }
      else {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? t('applyFailed'))
      }
    } catch {
      setError(t('networkError'))
    } finally {
      setApplying(null)
    }
  }

  const summaryLine = (s: Sources) =>
    (['cover', 'info', 'description', 'screenshots'] as const)
      .filter(k => s[k])
      .map(k => `${t(`field_${k}`)}: ${(SOURCE_LABEL as Record<string, string>)[s[k]!] ?? s[k]}`)
      .join('  ·  ')

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {/* One-click fill (follows the provider matrix) */}
        <button
          type="button"
          onClick={fillNow}
          disabled={filling}
          className="group flex h-10 items-center gap-3 pl-1.5 pr-4 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-60 text-white shadow-md shadow-violet-900/30 ring-1 ring-inset ring-white/10 transition-all"
          title={t('buttonHint')}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/15">
            {filling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          </span>
          <span className="flex flex-col items-start text-left leading-tight">
            <span className="text-sm font-semibold">{t('button')}</span>
            <span className="text-[11px] text-white/70">{filling ? t('filling') : t('buttonSub')}</span>
          </span>
        </button>
        {/* Manual fallback */}
        <AdminButton
          variant="secondary"
          size="md"
          type="button"
          onClick={openManual}
          title={t('manualHint')}
        >
          <Search className="w-3.5 h-3.5" />
          {t('manual')}
        </AdminButton>
      </div>

      {/* Provenance summary after a one-click fill */}
      {summary && (
        <p className="text-xs text-muted-foreground max-w-md text-right">
          {t('appliedFrom')} {summaryLine(summary) || '—'}
        </p>
      )}
      {topError && <p className="text-xs text-destructive max-w-md text-right">{topError}</p>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

          <div className="relative z-10 bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="font-semibold">{t('modalTitle')}</h3>
                {provider && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('searchingIn')} {provider ? SOURCE_LABEL[provider] : ''}
                  </p>
                )}
              </div>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualSearch} className="px-4 pt-3 pb-2 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground"
                />
              </div>
              <AdminButton
                variant="primary"
                size="md"
                type="submit"
                disabled={loading || !manualQuery.trim()}
              >
                <Search className="w-3.5 h-3.5" />
                {t('search')}
              </AdminButton>
            </form>

            {/* Provider selector — force which source serves the search (the
                default one may not list this game). */}
            <div className="px-4 pb-1 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('providerLabel')}</span>
              <div className="flex gap-1">
                {providers.map((p) => {
                  const active = (forcedProvider ?? provider) === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickProvider(p.id)}
                      disabled={loading || !p.available}
                      title={p.available ? undefined : `${p.label} no responde para esta plataforma`}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors disabled:opacity-50 ${
                        active
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-secondary border-border text-muted-foreground hover:text-foreground hover:bg-accent'
                      }`}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {usedQuery && !loading && (
              <p className="px-5 pb-1 text-xs text-muted-foreground">
                {t('resultsFor')} <span className="text-foreground/70 font-medium">&quot;{usedQuery}&quot;</span>
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
                <p className="text-sm text-muted-foreground text-center py-12">{t('noResults')}</p>
              )}

              <div className="space-y-2">
                {results.map((r) => (
                  <button
                    key={`${r.source}-${r.id}`}
                    onClick={() => applyPick(r)}
                    disabled={applying === String(r.id)}
                    className="w-full flex items-center gap-4 p-3 rounded-lg hover:bg-accent transition-colors text-left disabled:opacity-50 group"
                  >
                    <div className="w-12 h-16 flex-shrink-0 rounded overflow-hidden bg-secondary">
                      {r.thumb ? (
                        <Image src={r.thumb} alt={r.title} width={48} height={64} className="object-cover w-full h-full" unoptimized />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/40 text-xl font-bold">
                          {r.title.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{r.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {r.platform && <span className="text-xs text-muted-foreground/50">{r.platform}</span>}
                      </div>
                    </div>
                    {applying === String(r.id)
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
    </div>
  )
}
