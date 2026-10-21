'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'

interface ArtJob {
  status: 'running' | 'done' | 'failed' | 'cancelled'
  total: number
  processed: number
  applied: number
  skipped: number
  failed: number
  lastTitle: string | null
  message: string | null
}

export function ArtJobPanel() {
  const t = useTranslations('ArtJob')
  const [job, setJob] = useState<ArtJob | null>(null)
  const running = job?.status === 'running'

  const load = useCallback(async () => {
    try {
      const data = await (await fetch('/api/admin/jobs/active?type=art')).json()
      setJob(data.job ?? null)
    } catch { /* keep the last state */ }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, running ? 3000 : 15000)
    return () => clearInterval(timer)
  }, [load, running])

  const start = async (redo: boolean) => {
    await fetch('/api/admin/jobs/art', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redo }),
    })
    load()
  }
  const cancel = async () => {
    await fetch('/api/admin/jobs/cancel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'art' }),
    })
    load()
  }

  const pct = job && job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div>
        <h2 className="font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('desc')}</p>
      </div>

      {running && job && (
        <div className="space-y-1.5">
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t('progress', { processed: job.processed, total: job.total })}
            {job.lastTitle && <span className="truncate">· {job.lastTitle}</span>}
          </p>
        </div>
      )}
      {job && !running && (
        <p className="text-xs text-muted-foreground">
          {job.status === 'failed' && job.message ? job.message : t('summary', { applied: job.applied, skipped: job.skipped, failed: job.failed })}
        </p>
      )}

      <div className="flex gap-2">
        {running ? (
          <button onClick={cancel} className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-secondary">{t('cancel')}</button>
        ) : (
          <>
            <button onClick={() => start(false)} className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90">{t('start')}</button>
            <button onClick={() => start(true)} className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-secondary">{t('redo')}</button>
          </>
        )}
      </div>
    </div>
  )
}
