'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter }                                  from 'next/navigation'
import { Download, CheckCircle2, Clock, Loader2, AlertCircle, ArrowLeft } from 'lucide-react'
import { formatBytes }                                from '@/lib/utils'
import type { TokenStatus } from '@/lib/queue-status'

interface BatchItem {
  token:    string
  dlcId:    number
  fileName: string
  fileSize: string
  status:   TokenStatus | 'error'   // 'error' only exists on the client: a poll that failed
  position: number
  redirectUrl?: string
}

const POLL_MS       = 2000
/** Minimum gap between consecutive download triggers (ms). */
const DOWNLOAD_GAP  = 3000

export default function BatchQueuePage() {
  const router                      = useRouter()
  const [items, setItems]           = useState<BatchItem[]>([])
  const [loaded, setLoaded]         = useState(false)
  const [batchId, setBatchId]       = useState<string | null>(null)
  const [notFound, setNotFound]     = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const downloadedRef               = useRef<Set<string>>(new Set())
  /** FIFO queue of items waiting to be triggered one-by-one. */
  const dlQueue     = useRef<Array<{ token: string; redirectUrl: string; fileName: string }>>([])
  /** True while a download has been triggered and the gap timer is running. */
  const dlActiveRef = useRef(false)

  // The URL carries only the batch id; the files come from the server.
  useEffect(() => {
    setBatchId(new URLSearchParams(window.location.search).get('id'))
    setLoaded(true)
  }, [])

  // Poll the whole batch with one request per tick, until every file is final.
  useEffect(() => {
    if (!loaded || !batchId || notFound) return
    if (items.length > 0 && items.every(i => i.status === 'done' || i.status === 'expired')) return

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/queue/batch/${batchId}`)
        if (res.status === 404) { setNotFound(true); setItems([]); return }
        if (!res.ok) return
        const data = await res.json()
        setItems(data.items as BatchItem[])
      } catch { /* try again on the next tick */ }
    }, POLL_MS)

    return () => clearTimeout(timer)
  }, [items, loaded, batchId, notFound])

  /** Trigger the next queued download (if not already busy). */
  const processQueue = useCallback(() => {
    if (dlActiveRef.current) return
    if (dlQueue.current.length === 0) return

    const next = dlQueue.current.shift()!
    dlActiveRef.current = true

    const a = document.createElement('a')
    a.href     = next.redirectUrl
    a.download = next.fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    // Optimistically mark as downloading
    setItems(prev => prev.map(i =>
      i.token === next.token ? { ...i, status: 'downloading' } : i
    ))

    // Wait before allowing the next one so the browser doesn't block concurrent downloads
    setTimeout(() => {
      dlActiveRef.current = false
      processQueue()
    }, DOWNLOAD_GAP)
  }, [])

  // Enqueue newly-ready tokens and kick off the sequential processor
  useEffect(() => {
    let enqueued = false
    for (const item of items) {
      if (item.status === 'ready' && item.redirectUrl && !downloadedRef.current.has(item.token)) {
        downloadedRef.current.add(item.token)
        dlQueue.current.push({ token: item.token, redirectUrl: item.redirectUrl, fileName: item.fileName })
        enqueued = true
      }
    }
    if (enqueued) processQueue()
  }, [items, processQueue])

  /** Cancel what is still waiting in the server queue; ready and running files are left alone. */
  const cancelWaiting = async () => {
    if (!batchId) return
    setCancelling(true)
    try {
      await fetch(`/api/queue/batch/${batchId}`, { method: 'DELETE' })
      const res = await fetch(`/api/queue/batch/${batchId}`)
      if (res.ok) setItems((await res.json()).items as BatchItem[])
    } finally {
      setCancelling(false)
    }
  }

  if (!loaded) return null

  if (items.length === 0) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
        <p className="text-muted-foreground">No hay archivos en cola.</p>
        <button onClick={() => router.back()} className="text-sm text-primary hover:underline flex items-center gap-1.5 mx-auto">
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
      </div>
    )
  }

  const doneCount  = items.filter(i => i.status === 'done' || i.status === 'downloading').length
  const totalCount = items.length
  const allDone    = items.every(i => i.status === 'done')
  const totalSize  = items.reduce((acc, i) => acc + BigInt(i.fileSize), BigInt(0))

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Descarga por lotes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {doneCount} / {totalCount} archivos · {formatBytes(totalSize)} total
          </p>
        </div>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500 rounded-full"
          style={{ width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%` }}
        />
      </div>

      {items.some(i => i.status === 'waiting') && (
        <div className="flex justify-end">
          <button
            onClick={cancelWaiting}
            disabled={cancelling}
            className="text-sm text-red-500 hover:underline disabled:opacity-50"
          >
            Cancelar los que están en cola
          </button>
        </div>
      )}

      {/* File list */}
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.token}
            className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3"
          >
            <StatusIcon status={item.status} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.fileName}</p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(BigInt(item.fileSize))}
                {item.status === 'waiting' && item.position > 0 && (
                  <span className="ml-2">· posición {item.position} en cola</span>
                )}
              </p>
            </div>
            <StatusBadge status={item.status} />
          </div>
        ))}
      </div>

      {allDone && (
        <div className="text-center py-4">
          <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm font-medium">¡Todos los archivos descargados!</p>
          <button onClick={() => router.back()} className="mt-3 text-sm text-primary hover:underline">
            Volver
          </button>
        </div>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: BatchItem['status'] }) {
  switch (status) {
    case 'done':
      return <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
    case 'downloading':
      return <Download className="w-5 h-5 text-blue-500 flex-shrink-0 animate-bounce" />
    case 'ready':
      return <Loader2 className="w-5 h-5 text-primary flex-shrink-0 animate-spin" />
    case 'error':
      return <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
    default:
      return <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
  }
}

function StatusBadge({ status }: { status: BatchItem['status'] }) {
  const map: Record<BatchItem['status'], { label: string; cls: string }> = {
    waiting:     { label: 'En cola',     cls: 'text-muted-foreground' },
    ready:       { label: 'Iniciando…',  cls: 'text-primary' },
    downloading: { label: 'Descargando', cls: 'text-blue-500' },
    done:        { label: 'Listo',       cls: 'text-green-500' },
    expired:     { label: 'Caducada',    cls: 'text-amber-500' },
    error:       { label: 'Error',       cls: 'text-red-500' },
  }
  const { label, cls } = map[status]
  return <span className={`text-xs font-medium flex-shrink-0 ${cls}`}>{label}</span>
}
