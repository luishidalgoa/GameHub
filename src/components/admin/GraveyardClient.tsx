'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Trash2, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'

interface RecoverDetail {
  graveyardId: number
  newId: number
  title: string
  success: boolean
  matchedBy?: string
  error?: string
}

// ── Single-game delete ────────────────────────────────────────────────────────

export function DeleteGameButton({ id }: { id: number }) {
  const t = useTranslations('AdminGraveyard')
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleDelete = () => {
    if (!window.confirm(t('confirmDelete'))) return
    setLoading(true)
    fetch('/api/admin/graveyard', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
      .then(() => router.refresh())
      .finally(() => setLoading(false))
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      title={t('deleteTitle')}
      className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  )
}

// ── Purge all ─────────────────────────────────────────────────────────────────

export function PurgeAllButton({ count }: { count: number }) {
  const t = useTranslations('AdminGraveyard')
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  if (count === 0) return null

  if (!confirmed) {
    return (
      <button
        onClick={() => setConfirmed(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-red-700/40 text-red-400 hover:bg-red-500/10 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        {t('purgeAll')}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-red-950/40 border border-red-700/50 rounded-md text-sm">
      <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
      <span className="text-red-300">{t('purgeConfirm', { count })}</span>
      <button
        onClick={() => {
          setLoading(true)
          fetch('/api/admin/graveyard', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ purge: true }),
          })
            .then(() => {
              setConfirmed(false)
              router.refresh()
            })
            .finally(() => setLoading(false))
        }}
        disabled={loading}
        className="ml-1 px-2 py-0.5 text-xs font-medium bg-red-700 hover:bg-red-600 text-white rounded transition-colors disabled:opacity-50"
      >
        {loading ? t('deleting') : t('purgeYes')}
      </button>
      <button
        onClick={() => setConfirmed(false)}
        disabled={loading}
        className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground rounded transition-colors"
      >
        {t('cancel')}
      </button>
    </div>
  )
}

// ── Recover metadata ──────────────────────────────────────────────────────────

export function RecoverMetadataButton({ count }: { count: number }) {
  const t = useTranslations('AdminGraveyard')
  const router = useRouter()
  const [loading, setLoading]     = useState(false)
  const [result, setResult]       = useState<{ recovered: number; failed: number; notFound: number; details: RecoverDetail[] } | null>(null)
  const [logsOpen, setLogsOpen]   = useState(false)

  if (count === 0) return null

  const handleRecover = () => {
    if (!window.confirm(t('recoverConfirm') || 'Recover metadata from graveyard games?')) return
    setResult(null)
    setLogsOpen(false)
    setLoading(true)

    fetch('/api/admin/graveyard/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'auto' }),
    })
      .then((res) => res.json())
      .then((data) => {
        const details: RecoverDetail[] = data.details ?? []
        const notFound = details.filter((d) => d.success === false && !d.error).length
        setResult({ recovered: data.recovered ?? 0, failed: data.failed ?? 0, notFound, details })
        if ((data.recovered ?? 0) > 0) setTimeout(() => router.refresh(), 1500)
      })
      .catch((err) => {
        console.error(err)
        setResult({ recovered: 0, failed: 1, notFound: 0, details: [{ graveyardId: 0, newId: 0, title: 'Network error', success: false, error: String(err) }] })
      })
      .finally(() => setLoading(false))
  }

  const BADGE: Record<string, string> = {
    sha256:   'bg-emerald-800/60 text-emerald-300',
    fileName: 'bg-blue-800/60 text-blue-300',
    title:    'bg-yellow-800/60 text-yellow-300',
  }

  if (result) {
    return (
      <div className="w-full space-y-2">
        {/* Summary bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border ${result.recovered > 0 ? 'bg-green-950/40 border-green-700/50' : 'bg-zinc-900 border-zinc-700'}`}>
            <RefreshCw className={`w-3.5 h-3.5 ${result.recovered > 0 ? 'text-green-400' : 'text-zinc-400'}`} />
            <span className={result.recovered > 0 ? 'text-green-300' : 'text-zinc-400'}>
              {result.recovered} recovered
              {result.failed > 0 && <span className="text-red-400 ml-2">{result.failed} errors</span>}
              {result.notFound > 0 && <span className="text-zinc-500 ml-2">{result.notFound} not matched</span>}
            </span>
          </div>
          <button
            onClick={() => setLogsOpen((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {logsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {logsOpen ? 'Hide log' : 'Show log'}
          </button>
          <button
            onClick={() => { setResult(null); setLogsOpen(false) }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
          >
            ✕ dismiss
          </button>
        </div>

        {/* Detail log */}
        {logsOpen && (
          <div className="rounded-md border border-border bg-zinc-950 p-3 max-h-72 overflow-y-auto space-y-1 text-xs font-mono">
            {result.details.length === 0 && (
              <p className="text-zinc-500 italic">No graveyard games had metadata to recover.</p>
            )}
            {result.details.map((d, i) => (
              <div key={i} className="flex items-start gap-2">
                {d.success
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                  : d.error
                    ? <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                    : <AlertCircle className="w-3.5 h-3.5 text-zinc-500 mt-0.5 shrink-0" />
                }
                <span className={d.success ? 'text-zinc-200' : d.error ? 'text-red-300' : 'text-zinc-500'}>
                  {d.title}
                </span>
                {d.matchedBy && (
                  <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] shrink-0 ${BADGE[d.matchedBy] ?? 'bg-zinc-800 text-zinc-400'}`}>
                    {d.matchedBy}
                  </span>
                )}
                {d.error && <span className="text-red-400 ml-1 truncate">{d.error}</span>}
                {!d.success && !d.error && <span className="text-zinc-600 ml-auto text-[10px]">no match</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={handleRecover}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-green-700/40 text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
      {loading ? (t('recovering') || 'Recovering...') : (t('recoverMetadata') || 'Recover Metadata')}
    </button>
  )
}
