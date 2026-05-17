'use client'

import { useState, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Sparkles, StopCircle, CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BatchEvent } from '@/lib/metadata/batch'

const AUTO_THRESHOLD   = 68
const REVIEW_THRESHOLD = 40

interface LogEntry extends BatchEvent {
  key: number
}

type RunState = 'idle' | 'running' | 'done'

export function MetadataBatchPanel() {
  const t = useTranslations('MetadataBatch')
  const [state, setState]           = useState<RunState>('idle')
  const [log, setLog]               = useState<LogEntry[]>([])
  const [summary, setSummary]       = useState<BatchEvent | null>(null)
  const [withCovers, setWithCovers] = useState(true)
  const esRef   = useRef<EventSource | null>(null)
  const logEnd  = useRef<HTMLDivElement>(null)
  const keyRef  = useRef(0)

  const push = useCallback((ev: BatchEvent) => {
    setLog(prev => {
      const next = [...prev, { ...ev, key: keyRef.current++ }]
      return next.length > 300 ? next.slice(-300) : next
    })
    setTimeout(() => logEnd.current?.scrollIntoView({ behavior: 'smooth' }), 30)
  }, [])

  const start = () => {
    if (state === 'running') return
    setLog([])
    setSummary(null)
    setState('running')

    const url = `/api/admin/metadata/batch?covers=${withCovers}`
    const es  = new EventSource(url)
    esRef.current = es

    es.onmessage = (e) => {
      const ev: BatchEvent = JSON.parse(e.data)
      if (ev.type === 'done') {
        setSummary(ev)
        setState('done')
        es.close()
      } else {
        push(ev)
      }
    }

    es.onerror = () => {
      push({ type: 'failed', reason: 'Connection to server lost' })
      setState('done')
      es.close()
    }
  }

  const stop = () => {
    esRef.current?.close()
    setState('done')
    push({ type: 'failed', reason: 'Stopped manually' })
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            {t('title')}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('description', { threshold: AUTO_THRESHOLD, review: REVIEW_THRESHOLD, max: AUTO_THRESHOLD - 1 })}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Cover toggle */}
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={withCovers}
              onChange={e => setWithCovers(e.target.checked)}
              disabled={state === 'running'}
              className="accent-primary"
            />
            {t('downloadCovers')}
          </label>

          {state === 'running' ? (
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
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-md transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              {state === 'done' ? t('runAgain') : t('start')}
            </button>
          )}
        </div>
      </div>

      {/* Progress summary bar */}
      {(state === 'running' || state === 'done') && log.length > 0 && (() => {
        const last = [...log].reverse().find(e => e.total !== undefined)
        if (!last?.total) return null
        const pct = Math.round(((last.processed ?? 0) / last.total) * 100)
        return (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{last.processed ?? 0} / {last.total} games</span>
              <span className="flex gap-3">
                <span className="text-green-400">✓ {last.applied ?? 0} {t('applied').toLowerCase()}</span>
                <span className="text-amber-400">⚠ {last.skipped ?? 0} {t('skipped').toLowerCase()}</span>
                <span className="text-red-400">✗ {last.failed ?? 0} {t('failed').toLowerCase()}</span>
              </span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-300', state === 'done' ? 'bg-green-500' : 'bg-violet-500')}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })()}

      {/* Done summary */}
      {state === 'done' && summary && (
        <div className="grid grid-cols-3 gap-3">
          <SummaryCard icon={<CheckCircle2 className="w-4 h-4 text-green-400" />} label={t('applied')}  value={summary.applied  ?? 0} color="text-green-400" />
          <SummaryCard icon={<AlertTriangle className="w-4 h-4 text-amber-400" />} label={t('skipped')} value={summary.skipped  ?? 0} color="text-amber-400" />
          <SummaryCard icon={<XCircle className="w-4 h-4 text-red-400" />}         label={t('failed')}  value={summary.failed   ?? 0} color="text-red-400" />
        </div>
      )}

      {/* Live log */}
      {log.length > 0 && (
        <div className="bg-background/60 border border-border rounded-lg p-3 h-64 overflow-y-auto font-mono text-xs space-y-0.5">
          {log.map(ev => <LogLine key={ev.key} ev={ev} />)}
          {state === 'running' && (
            <div className="flex items-center gap-2 text-muted-foreground py-0.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{t('processing')}</span>
            </div>
          )}
          <div ref={logEnd} />
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

function LogLine({ ev }: { ev: BatchEvent }) {
  if (ev.type === 'start') {
    return <p className="text-muted-foreground">→ Found <strong>{ev.total}</strong> games without metadata</p>
  }

  if (ev.type === 'applied') {
    return (
      <p className="text-green-400">
        <span className="text-muted-foreground mr-2">[{ev.processed}/{ev.total}]</span>
        ✓ <span className="text-foreground/80">{ev.title}</span>
        {ev.matchedTitle && ev.matchedTitle !== ev.title && (
          <span className="text-green-400/60"> → {ev.matchedTitle}</span>
        )}
        <span className="text-green-400/60"> ({ev.confidence}%)</span>
      </p>
    )
  }

  if (ev.type === 'skipped') {
    const isUncertain = ev.reason === 'uncertain'
    return (
      <p className={cn(isUncertain ? 'text-amber-400' : 'text-muted-foreground/60')}>
        <span className="text-muted-foreground mr-2">[{ev.processed}/{ev.total}]</span>
        {isUncertain ? '⚠' : '–'} <span>{ev.title}</span>
        {ev.matchedTitle && <span className="opacity-60"> (best: "{ev.matchedTitle}" {ev.confidence}%)</span>}
        {ev.reason === 'no_results' && <span className="opacity-60"> — no results</span>}
        {ev.reason === 'low_confidence' && <span className="opacity-60"> — too different</span>}
      </p>
    )
  }

  if (ev.type === 'failed') {
    return (
      <p className="text-red-400">
        {ev.gameId && <span className="text-muted-foreground mr-2">[{ev.processed}/{ev.total}]</span>}
        ✗ {ev.title ?? 'error'} — {ev.reason}
      </p>
    )
  }

  return null
}
