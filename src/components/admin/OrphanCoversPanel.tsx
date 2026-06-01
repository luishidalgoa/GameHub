'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Eraser, Loader2 } from 'lucide-react'

type Result = { scanned: number; referenced: number; deleted: number }

export function OrphanCoversPanel() {
  const t = useTranslations('OrphanCovers')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')

  const run = async () => {
    if (running) return
    if (!confirm(t('confirm'))) return
    setRunning(true)
    setResult(null)
    setError('')
    try {
      const res = await fetch('/api/admin/covers/cleanup', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) setError(data.error ?? 'Cleanup failed')
      else setResult(data as Result)
    } catch {
      setError('Network error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-semibold">{t('title')}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{t('description')}</p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-secondary border border-border hover:bg-accent disabled:opacity-50 rounded-md text-sm font-medium transition-colors whitespace-nowrap"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eraser className="w-4 h-4" />}
          {running ? t('running') : t('button')}
        </button>
      </div>

      {result && (
        <p className="mt-4 text-sm text-muted-foreground">
          {t('result', { scanned: result.scanned, referenced: result.referenced, deleted: result.deleted })}
        </p>
      )}
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
  )
}
