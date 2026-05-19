'use client'

import { useEffect, useState }  from 'react'
import { useRouter }             from 'next/navigation'
import { Download, Package, RefreshCw, Wrench, Loader2 } from 'lucide-react'
import { formatBytes }           from '@/lib/utils'

interface ExtrasInfo {
  dlc:    { count: number; totalSize: string }
  update: { count: number; totalSize: string }
  mod:    { count: number; totalSize: string }
}

type DlcType = 'dlc' | 'update' | 'mod'

interface Props {
  platformSlug: string
}

const TYPE_META: Record<DlcType, { label: string; icon: React.ReactNode; color: string; border: string }> = {
  dlc:    { label: 'DLCs',    icon: <Package   className="w-4 h-4" />, color: 'text-purple-400', border: 'border-purple-500/40 hover:border-purple-400' },
  update: { label: 'Updates', icon: <RefreshCw className="w-4 h-4" />, color: 'text-sky-400',    border: 'border-sky-500/40 hover:border-sky-400'       },
  mod:    { label: 'Mods',    icon: <Wrench    className="w-4 h-4" />, color: 'text-rose-400',   border: 'border-rose-500/40 hover:border-rose-400'      },
}

export function BulkExtrasDownload({ platformSlug }: Props) {
  const router = useRouter()
  const [info, setInfo]               = useState<ExtrasInfo | null>(null)
  const [loading, setLoading]         = useState(true)
  const [enqueueing, setEnqueueing]   = useState<DlcType | null>(null)

  useEffect(() => {
    fetch(`/api/platform-extras/${platformSlug}`)
      .then(r => r.json())
      .then(d => { setInfo(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [platformSlug])

  const hasAny = info && (info.dlc.count > 0 || info.update.count > 0 || info.mod.count > 0)
  if (!loading && !hasAny) return null

  const handleDownload = async (type: DlcType) => {
    if (enqueueing) return
    setEnqueueing(type)
    try {
      const res = await fetch('/api/queue/bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ platformSlug, type }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? 'Error al encolar la descarga')
        return
      }
      const { token } = await res.json()
      // Navigate to the shared queue page — same flow as normal downloads
      router.push(`/queue/${token}`)
    } catch {
      alert('Error al encolar la descarga')
    } finally {
      setEnqueueing(null)
    }
  }

  return (
    <div className="mt-4 mb-6 flex flex-wrap gap-3 items-center">
      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
        Descarga masiva:
      </span>

      {loading && (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando...
        </span>
      )}

      {!loading && info && (
        <>
          {(['dlc', 'update', 'mod'] as DlcType[]).map(type => {
            const { label, icon, color, border } = TYPE_META[type]
            const { count, totalSize } = info[type]
            if (count === 0) return null

            const isActive = enqueueing === type
            return (
              <button
                key={type}
                onClick={() => handleDownload(type)}
                disabled={!!enqueueing}
                className={`
                  flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium
                  bg-card transition-all
                  ${border}
                  ${isActive ? 'opacity-60 cursor-wait' : 'cursor-pointer'}
                  ${!!enqueueing && !isActive ? 'opacity-40 cursor-not-allowed' : ''}
                `}
              >
                {isActive
                  ? <Loader2 className={`w-4 h-4 animate-spin ${color}`} />
                  : <span className={color}>{icon}</span>
                }
                <span className={color}>{label}</span>
                <span className="text-muted-foreground text-xs">
                  {count} · {formatBytes(BigInt(totalSize))}
                </span>
                <Download className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )
          })}
        </>
      )}
    </div>
  )
}
