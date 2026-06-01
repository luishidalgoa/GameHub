'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Play, RefreshCw, ChevronDown, StopCircle } from 'lucide-react'
import useSWR from 'swr'
import type { Platform } from '@/types/platform'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function ScanPanel() {
  const t = useTranslations('ScanPanel')
  const [scanning, setScanning]         = useState(false)
  const [stopping, setStopping]         = useState(false)
  const [logs, setLogs]                 = useState<string[]>([])
  const [selectedSlug, setSelectedSlug] = useState<string>('all')
  const [phase, setPhase]               = useState<'idle' | 'scanning' | 'metadata'>('idle')
  const [meta, setMeta]                 = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const logRef = useRef<HTMLDivElement>(null)

  const { data: platforms } = useSWR<Platform[]>('/api/platforms', fetcher)

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  // On mount (and every 3s while idle), check whether a scan job is already
  // running in the background — e.g. you started it then navigated away, or the
  // server resumed it after a restart. If so, reflect that and attach the SSE
  // log so progress shows again.
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      if (scanning) return
      try {
        const res = await fetch('/api/admin/jobs/active?type=scan')
        const { job } = await res.json()
        if (!cancelled && job?.status === 'running') {
          setScanning(true)
          setPhase('scanning')
          setLogs(['↻ Reconnecting to a scan already in progress…'])
          attachStream(false)
        }
      } catch { /* ignore */ }
    }
    check()
    const iv = setInterval(check, 3000)
    return () => { cancelled = true; clearInterval(iv) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning])

  const startScan = () => {
    setScanning(true)
    setStopping(false)
    setPhase('scanning')
    setMeta({ done: 0, total: 0 })
    setLogs(['Starting scan…'])
    attachStream(true)
  }

  // Cancel a running scan (or its auto-metadata follow-up). The job runner aborts
  // the job's AbortController; the SSE stream then ends and the UI resets.
  const stopScan = async () => {
    setStopping(true)
    setLogs((prev) => [...prev, '⏹ Stopping…'])
    try {
      // Cancel both phases: a scan can already be in its auto-metadata step.
      await Promise.all([
        fetch('/api/admin/jobs/cancel', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'scan' }),
        }),
        fetch('/api/admin/jobs/cancel', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'metadata' }),
        }),
      ])
    } catch { /* ignore */ }
  }

  // Open the SSE stream and render progress. When `fresh` is true, start a new
  // background scan job once the server confirms the listener is registered.
  // When false (reconnecting to a running scan), we just listen — the job is
  // already going.
  const attachStream = (fresh: boolean) => {
    // Open SSE first — only trigger the start once the server confirms it's
    // listening, so fast single-platform scans don't emit everything before the
    // SSE connection exists (which would leave the UI stuck at "Starting scan…").
    const es = new EventSource('/api/scanner/stream')

    const triggerPost = () =>
      fetch('/api/admin/jobs/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedSlug !== 'all' ? { platformSlug: selectedSlug } : {}),
      }).catch(() => {
        setLogs((prev) => [...prev, '❌ Failed to start scan'])
        setScanning(false)
        es.close()
      })

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        let line = ''

        switch (event.type) {
          case 'connected':
            // SSE listener is now registered on the server.
            // Fresh run → kick off the job; reconnect → just keep listening.
            if (fresh) triggerPost()
            return
          case 'scan_start':
            line = '▶ Scan started'
            break
          case 'platform_start':
            line = `📂 Scanning ${event.platform}…`
            break
          case 'file_found':
            line = `  ${event.isNew ? '✚' : '·'} ${event.filePath?.split(/[\\/]/).pop()}`
            break
          case 'platform_done':
            line = `✓ ${event.platform}: ${event.count} found, ${event.added} new, ${event.updated} updated`
            break
          case 'scan_complete':
            line = `\n✅ Scan complete — ${event.total} games total, ${event.added} added, ${event.updated} updated, ${event.stale} stale`
            if ((event.added ?? 0) > 0) line += '\n🤖 Fetching metadata for new games…'
            break
          case 'scan_error':
            line = `❌ Error: ${event.message}`
            setScanning(false)
            setStopping(false)
            es.close()
            break
          case 'auto_meta_start':
            setPhase('metadata')
            setMeta({ done: 0, total: event.total ?? 0 })
            line = `\n🔍 Auto-metadata: ${event.total} game${event.total === 1 ? '' : 's'} to process`
            break
          case 'auto_meta_progress': {
            setMeta({ done: event.processed ?? 0, total: event.total ?? 0 })
            const icon = event.metaStatus === 'applied' ? '✚' : event.metaStatus === 'failed' ? '✗' : '·'
            const trailer = event.trailerFound ? ' 🎬' : ''
            line = `  ${icon} [${event.processed}/${event.total}] ${event.gameTitle}${trailer}`
            break
          }
          case 'auto_meta_done':
            line = `✅ Metadata done — ${event.added} applied, ${event.skipped} skipped, ${event.failed} failed`
            break
          case 'pipeline_done':
            line = event.message ? `ℹ ${event.message}` : ''
            setScanning(false)
            setStopping(false)
            es.close()
            break
          default:
            return
        }

        setLogs((prev) => [...prev, line])
      } catch { /* ignore parse errors */ }
    }

    es.onerror = () => {
      setLogs((prev) => [...prev, '⚠ Connection lost'])
      setScanning(false)
      setStopping(false)
      es.close()
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="font-semibold">{t('title')}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('description')}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap xl:flex-shrink-0">
          {/* Platform selector */}
          <div className="relative flex-1 min-w-[160px] xl:flex-none">
            <select
              value={selectedSlug}
              onChange={e => setSelectedSlug(e.target.value)}
              disabled={scanning}
              className="w-full appearance-none bg-secondary border border-border rounded-md pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 cursor-pointer"
            >
              <option value="all">All platforms</option>
              {platforms?.map(p => (
                <option key={p.slug} value={p.slug}>{p.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>

          {scanning ? (
            <button
              onClick={stopScan}
              disabled={stopping}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-sm font-medium transition-colors flex-1 min-w-[120px] xl:flex-none"
            >
              {stopping ? <RefreshCw className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4" />}
              {stopping ? t('stopping') : t('stop')}
            </button>
          ) : (
            <button
              onClick={startScan}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium transition-colors flex-1 min-w-[120px] xl:flex-none"
            >
              <Play className="w-4 h-4" />
              {t('runScan')}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {scanning && (
        <div className="mb-4 space-y-1.5">
          {phase === 'metadata' && meta.total > 0 ? (
            <>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t('metaProgress')} {meta.done}/{meta.total}</span>
                <span className="tabular-nums">{Math.round((meta.done / meta.total) * 100)}%</span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${Math.round((meta.done / meta.total) * 100)}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>{t('scanningRoms')}</span>
              </div>
              <div className="relative h-1.5 bg-secondary rounded-full overflow-hidden bar-indeterminate" />
            </>
          )}
        </div>
      )}

      {logs.length > 0 && (
        <div
          ref={logRef}
          className="bg-black/40 rounded-lg p-4 h-64 overflow-y-auto font-mono text-xs text-green-400 leading-relaxed"
        >
          {logs.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap">{line}</div>
          ))}
          {scanning && <span className="animate-pulse">█</span>}
        </div>
      )}
    </div>
  )
}
