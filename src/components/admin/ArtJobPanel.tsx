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
  startedAt: string
}

interface ArtStatus {
  status: Record<string, number>
  images: number
  gamesWithImages: number
}

/** "3 h 20 min", "45 min", or "—" when there is nothing to estimate yet. */
function duration(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '—'
  const totalMin = Math.round(hours * 60)
  const h = Math.floor(totalMin / 60), m = totalMin % 60
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

export function ArtJobPanel() {
  const t = useTranslations('ArtJob')
  const [job, setJob] = useState<ArtJob | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [stats, setStats] = useState<ArtStatus | null>(null)
  const running = job?.status === 'running'

  const load = useCallback(async () => {
    try {
      const data = await (await fetch('/api/admin/jobs/active?type=art')).json()
      setJob(data.job ?? null)
      setLog(Array.isArray(data.log) ? data.log : [])
      const st = await fetch('/api/admin/art/status')
      if (st.ok) setStats(await st.json())
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
  // Pace since the job started (a restart keeps the start time, so this is a fair average).
  const elapsedH = job ? (Date.now() - new Date(job.startedAt).getTime()) / 3600000 : 0
  const perHour = job && elapsedH > 0 ? job.processed / elapsedH : 0
  const remainingH = job && perHour > 0 ? (job.total - job.processed) / perHour : NaN
  const finishAt = Number.isFinite(remainingH) ? new Date(Date.now() + remainingH * 3600000) : null
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
            {t('progress', { processed: job.processed, total: job.total })} ({pct}%)
            {job.lastTitle && <span className="truncate">· {job.lastTitle}</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {Math.round(perHour)} juegos por hora · quedan {duration(remainingH)}
            {finishAt && <> · termina hacia las {finishAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</>}
          </p>
        </div>
      )}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded-md bg-secondary/50 px-3 py-2"><p className="text-muted-foreground">Con arte</p><p className="text-base font-semibold tabular-nums">{stats.status.ok ?? 0}</p></div>
          <div className="rounded-md bg-secondary/50 px-3 py-2"><p className="text-muted-foreground">Sin coincidencia</p><p className="text-base font-semibold tabular-nums">{stats.status['no-match'] ?? 0}</p></div>
          <div className="rounded-md bg-secondary/50 px-3 py-2"><p className="text-muted-foreground">Sin arte</p><p className="text-base font-semibold tabular-nums">{stats.status['no-art'] ?? 0}</p></div>
          <div className="rounded-md bg-secondary/50 px-3 py-2"><p className="text-muted-foreground">Imágenes guardadas</p><p className="text-base font-semibold tabular-nums">{stats.images.toLocaleString('es-ES')}</p></div>
        </div>
      )}
      {running && log.length > 0 && (
        <div className="bg-black/40 rounded-lg p-3 h-32 overflow-y-auto font-mono text-[11px] text-green-400 leading-relaxed">
          {log.slice(-12).map((line, i) => <div key={i} className="whitespace-pre-wrap">{line}</div>)}
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
