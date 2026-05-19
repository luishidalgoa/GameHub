'use client'

import { useEffect, useState } from 'react'
import { Download, Package, RefreshCw, Wrench, Loader2 } from 'lucide-react'
import { formatBytes } from '@/lib/utils'

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
  const [info, setInfo]         = useState<ExtrasInfo | null>(null)
  const [loading, setLoading]   = useState(true)
  const [downloading, setDownloading] = useState<DlcType | null>(null)

  useEffect(() => {
    fetch(`/api/platform-extras/${platformSlug}`)
      .then(r => r.json())
      .then(d => { setInfo(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [platformSlug])

  // Nothing to show
  const hasAny = info && (info.dlc.count > 0 || info.update.count > 0 || info.mod.count > 0)
  if (!loading && !hasAny) return null

  const handleDownload = async (type: DlcType) => {
    if (downloading) return
    setDownloading(type)
    try {
      // Trigger browser download by navigating to the streaming endpoint
      const a = document.createElement('a')
      a.href = `/api/download/platform-extras/${platformSlug}?type=${type}`
      a.download = `${platformSlug}-${type}s.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } finally {
      // Give the browser a moment to start the download before re-enabling
      setTimeout(() => setDownloading(null), 3000)
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

            const isActive = downloading === type
            return (
              <button
                key={type}
                onClick={() => handleDownload(type)}
                disabled={!!downloading}
                className={`
                  flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium
                  bg-card transition-all
                  ${border}
                  ${isActive ? 'opacity-60 cursor-wait' : 'cursor-pointer'}
                  ${!!downloading && !isActive ? 'opacity-40 cursor-not-allowed' : ''}
                `}
              >
                {isActive
                  ? <Loader2 className={`w-4 h-4 animate-spin ${color}`} />
                  : <span className={color}>{icon}</span>
                }
                <span className={color}>
                  {label}
                </span>
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
