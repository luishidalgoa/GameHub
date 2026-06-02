'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Sparkles, StopCircle, Loader2 } from 'lucide-react'

interface JobState {
  id: number
  status: 'running' | 'done' | 'failed' | 'cancelled'
  total: number
  processed: number
  applied: number
  skipped: number
  failed: number
  lastTitle: string | null
}

/**
 * Bulk "autocomplete scores" trigger for /admin/games. Starts the metadata job
 * in 'autocomplete-scores' mode (RAWG→Metacritic→LaunchBox for every game with
 * no score), reusing the shared job runner — so it's cancelable, resumable and
 * shows live progress. Respects the platform filter active in the URL.
 */
export function AutocompleteScoresButton({ platformSlug }: { platformSlug?: string }) {
  const t = useTranslations('Autocomplete')
  const [job, setJob] = useState<JobState | null>(null)
  const [starting, setStarting] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval>>()

  const running = job?.status === 'running'

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/jobs/active?type=metadata')
      const data = await res.json()
      setJob(data.job ?? null)
    } catch { /* keep last */ }
  }, [])

  useEffect(() => {
    fetchJob()
    pollRef.current = setInterval(fetchJob, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchJob])

  const start = async () => {
    if (running || starting) return
    setStarting(true)
    try {
      await fetch('/api/admin/jobs/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'autocomplete-scores', platformSlug: platformSlug || undefined }),
      })
      await fetchJob()
    } finally {
      setStarting(false)
    }
  }

  const stop = async () => {
    await fetch('/api/admin/jobs/cancel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metadata' }),
    })
    await fetchJob()
  }

  const pct = job && job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {running ? (
        <button
          onClick={stop}
          className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground text-sm rounded-md hover:bg-destructive/90 transition-colors"
        >
          <StopCircle className="w-4 h-4" />
          {t('stop')}
        </button>
      ) : (
        <button
          onClick={start}
          disabled={starting}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-sm rounded-md transition-colors"
          title={t('hint')}
        >
          {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {t('button')}
        </button>
      )}

      {running && job && (
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-40 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-violet-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
            {job.processed}/{job.total} · {t('found', { n: job.applied })}
          </span>
        </div>
      )}
      {!running && job && job.status !== 'running' && (job.applied > 0 || job.processed > 0) && (
        <span className="text-xs text-muted-foreground">
          {t('done', { n: job.applied })}
        </span>
      )}
    </div>
  )
}
