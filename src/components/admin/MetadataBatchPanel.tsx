'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Sparkles, StopCircle, CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const AUTO_THRESHOLD   = 68
const REVIEW_THRESHOLD = 40

type Mode = 'missing' | 'fill' | 'redo' | 'wrong-provider'

interface PlatformOpt { slug: string; name: string }

// Shape returned by GET /api/admin/jobs/active
interface JobState {
  id: number
  status: 'running' | 'done' | 'failed' | 'cancelled'
  total: number
  processed: number
  applied: number
  skipped: number
  failed: number
  lastTitle: string | null
  message: string | null
}

export function MetadataBatchPanel({ platforms = [] }: { platforms?: PlatformOpt[] }) {
  const t = useTranslations('MetadataBatch')
  const [job, setJob]               = useState<JobState | null>(null)
  const [withCovers, setWithCovers] = useState(true)
  const [mode, setMode]             = useState<Mode>('missing')
  const [platform, setPlatform]     = useState('')
  const [starting, setStarting]     = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval>>()

  const running = job?.status === 'running'

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/jobs/active?type=metadata')
      const data = await res.json()
      setJob(data.job ?? null)
    } catch { /* transient — keep last state */ }
  }, [])

  // Poll while a job is running; also fetch once on mount so we pick up a job
  // that's already in progress when you return to the dashboard.
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
        body: JSON.stringify({ mode, platformSlug: platform || undefined, withCovers }),
      })
      await fetchJob()
    } finally {
      setStarting(false)
    }
  }

  const stop = async () => {
    await fetch('/api/admin/jobs/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metadata' }),
    })
    await fetchJob()
  }

  const pct = job && job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            {t('title')}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('description', { threshold: AUTO_THRESHOLD, review: REVIEW_THRESHOLD, max: AUTO_THRESHOLD - 1 })}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
          {/* Mode selector */}
          <select
            value={mode}
            onChange={e => setMode(e.target.value as Mode)}
            disabled={running}
            title={t('modeHint')}
            className="bg-secondary border border-border rounded-md px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          >
            <option value="missing">{t('modeMissing')}</option>
            <option value="fill">{t('modeFill')}</option>
            <option value="redo">{t('modeRedo')}</option>
            <option value="wrong-provider">{t('modeWrongProvider')}</option>
          </select>

          {/* Platform selector */}
          <select
            value={platform}
            onChange={e => setPlatform(e.target.value)}
            disabled={running}
            title={t('platformHint')}
            className="bg-secondary border border-border rounded-md px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          >
            <option value="">{t('allPlatforms')}</option>
            {platforms.map(p => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>

          {/* Cover toggle */}
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={withCovers}
              onChange={e => setWithCovers(e.target.checked)}
              disabled={running}
              className="accent-primary"
            />
            {t('downloadCovers')}
          </label>

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
            >
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {job && job.status !== 'running' ? t('runAgain') : t('start')}
            </button>
          )}
        </div>
      </div>

      {/* Running progress (persisted — survives navigation / reload) */}
      {running && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              {job!.total > 0 ? `${job!.processed} / ${job!.total}` : t('processing')}
              {job!.lastTitle && <span className="text-foreground/60 truncate max-w-[220px]">· {job!.lastTitle}</span>}
            </span>
            <span className="flex gap-3">
              <span className="text-green-400">✓ {job!.applied}</span>
              <span className="text-amber-400">⚠ {job!.skipped}</span>
              <span className="text-red-400">✗ {job!.failed}</span>
            </span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            {job!.total > 0 ? (
              <div className="h-full bg-violet-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
            ) : (
              <div className="h-full bar-indeterminate" />
            )}
          </div>
        </div>
      )}

      {/* Finished summary */}
      {job && job.status !== 'running' && (
        <div className="space-y-3">
          {job.status === 'failed' && job.message && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-2">
              {job.message}
            </p>
          )}
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard icon={<CheckCircle2 className="w-4 h-4 text-green-400" />} label={t('applied')} value={job.applied} color="text-green-400" />
            <SummaryCard icon={<AlertTriangle className="w-4 h-4 text-amber-400" />} label={t('skipped')} value={job.skipped} color="text-amber-400" />
            <SummaryCard icon={<XCircle className="w-4 h-4 text-red-400" />} label={t('failed')} value={job.failed} color="text-red-400" />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="bg-secondary/50 border border-border rounded-lg px-4 py-3 flex items-center gap-3">
      {icon}
      <div>
        <p className={cn('text-xl font-bold tabular-nums', color)}>{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
