'use client'

import { useState }            from 'react'
import { useRouter }           from 'next/navigation'
import { Download, Loader2 }   from 'lucide-react'

type DlcType = 'dlc' | 'update' | 'mod'

interface Props {
  gameId: number
  type:   DlcType
  count:  number
}

const LABEL: Record<DlcType, string> = {
  dlc:    'Descargar todos los DLC',
  update: 'Descargar todos los updates',
  mod:    'Descargar todos los mods',
}

export function BulkDownloadButton({ gameId, type, count }: Props) {
  const router              = useRouter()
  const [loading, setLoading] = useState(false)

  if (count < 2) return null  // Not worth a batch page for a single file

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
      const { items } = await res.json()
      // Pass batch data via sessionStorage to avoid huge URLs
      sessionStorage.setItem('bulkBatch', JSON.stringify(items))
      router.push('/queue/batch')
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
        ? <Loader2  className="w-3.5 h-3.5 animate-spin" />
        : <Download className="w-3.5 h-3.5" />
      }
      Todo ({count})
    </button>
  )
}
