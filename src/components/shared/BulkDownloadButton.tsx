'use client'

import { useState }      from 'react'
import { useRouter }     from 'next/navigation'
import { Archive, Loader2 } from 'lucide-react'
import type { BulkType } from '@/lib/bulk-queue'

interface Props {
  gameId:    number
  type:      BulkType
  count:     number
}

const LABEL: Record<BulkType, string> = {
  dlc:    'Descargar todos los DLC',
  update: 'Descargar todos los updates',
  mod:    'Descargar todos los mods',
}

export function BulkDownloadButton({ gameId, type, count }: Props) {
  const router   = useRouter()
  const [loading, setLoading] = useState(false)

  if (count < 2) return null  // Only show when there are multiple files worth zipping

  const handleClick = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/queue/bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ gameId, type }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? 'Error al encolar la descarga')
        return
      }
      const { token } = await res.json()
      router.push(`/queue/${token}`)
    } catch {
      alert('Error al encolar la descarga')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title={LABEL[type]}
      className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors border border-border"
    >
      {loading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <Archive  className="w-3.5 h-3.5" />
      }
      ZIP ({count})
    </button>
  )
}
