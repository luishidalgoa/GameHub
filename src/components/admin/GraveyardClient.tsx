'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Trash2, AlertTriangle, RefreshCw } from 'lucide-react'

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
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ recovered: number; failed: number } | null>(null)

  if (count === 0) return null

  const handleRecover = () => {
    if (!window.confirm(t('recoverConfirm') || 'Recover metadata from graveyard games?')) return

    setResult(null)
    setLoading(true)

    fetch('/api/admin/graveyard/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'auto' }),
    })
      .then((res) => res.json())
      .then((data) => {
        setResult({ recovered: data.recovered, failed: data.failed })
        setTimeout(() => {
          router.refresh()
        }, 1500)
      })
      .catch((err) => {
        console.error(err)
        alert(t('recoverError') || 'Recovery failed')
      })
      .finally(() => setLoading(false))
  }

  if (result) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-green-950/40 border border-green-700/50 rounded-md text-sm">
        <RefreshCw className="w-3.5 h-3.5 text-green-400 shrink-0" />
        <span className="text-green-300">
          {t('recoverSuccess', { count: result.recovered }) || `✓ ${result.recovered} games recovered`}
          {result.failed > 0 && ` (${result.failed} failed)`}
        </span>
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
