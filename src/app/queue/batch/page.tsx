'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter }                    from 'next/navigation'
import { Download, CheckCircle2, Clock, Loader2, AlertCircle, ArrowLeft } from 'lucide-react'
import { formatBytes }                  from '@/lib/utils'

interface BatchItem {
  token:    string
  dlcId:    number
  fileName: string
  fileSize: string
  status:   'waiting' | 'ready' | 'downloading' | 'done' | 'error'
  position: number
  redirectUrl?: string
}

const POLL_MS = 2000

export default function BatchQueuePage() {
  const router                      = useRouter()
  const [items, setItems]           = useState<BatchItem[]>([])
  const [loaded, setLoaded]         = useState(false)
  const downloadedRef               = useRef<Set<string>>(new Set())

  // Load batch from sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('bulkBatch')
      if (raw) {
        const parsed = JSON.parse(raw) as BatchItem[]
        setItems(parsed)
        sessionStorage.removeItem('bulkBatch')
      }
    } catch { /* ignore */ }
    setLoaded(true)
  }, [])

  // Poll all non-done tokens
  useEffect(() => {
    if (!loaded || items.length === 0) return

    const pending = items.filter(i => i.status !== 'done' && i.status !== 'error')
    if (pending.length === 0) return

    const timer = setTimeout(async () => {
      const updates = await Promise.all(
        pending.map(async (item) => {
          try {
            const res  = await fetch(`/api/queue/${item.token}`)
            const data = await res.json()
            if (!res.ok) return { ...item, status: 'error' as const }
            return {
              ...item,
              status:      data.status as BatchItem['status'],
              position:    data.position ?? 0,
              redirectUrl: data.redirectUrl,
            }
          } catch {
            return { ...item, status: 'error' as const }
          }
        })
      )

      setItems(prev => prev.map(item => {
        const upd = updates.find(u => u.token === item.token)
        return upd ?? item
      }))
    }, POLL_MS)

    return () => clearTimeout(timer)
  }, [items, loaded])

  // Auto-trigger download when a token becomes ready
  useEffect(() => {
    for (const item of items) {
      if (item.status === 'ready' && item.redirectUrl && !downloadedRef.current.has(item.token)) {
        downloadedRef.current.add(item.token)
        // Small stagger so browser doesn't block multiple simultaneous downloads
        const delay = [...downloadedRef.current].indexOf(item.token) * 800
        setTimeout(() => {
          const a = document.createElement('a')
          a.href = item.redirectUrl!
          a.download = item.fileName
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          // Optimistically mark as downloading
          setItems(prev => prev.map(i =>
            i.token === item.token ? { ...i, status: 'downloading' } : i
          ))
        }, delay)
      }
    }
  }, [items])

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
    error:       { label: 'Error',       cls: 'text-red-500' },
  }
  const { label, cls } = map[status]
  return <span className={`text-xs font-medium flex-shrink-0 ${cls}`}>{label}</span>
}
