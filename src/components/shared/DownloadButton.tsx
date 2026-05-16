'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Loader2 } from 'lucide-react'
import { formatBytes } from '@/lib/utils'

interface Props {
  gameId: number
  dlcId?: number
  label?: string
  fileSize?: string
  variant?: 'primary' | 'secondary'
}

export function DownloadButton({ gameId, dlcId, label, fileSize, variant = 'primary' }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleDownload = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, dlcId }),
      })

      if (!res.ok) {
        let msg = 'Failed to queue download'
        try {
          const text = await res.text()
          if (text) {
            const d = JSON.parse(text)
            msg = d.error ?? msg
          }
        } catch { /* ignore */ }
        alert(msg)
        return
      }

      const data = await res.json()

      // LÓGICA COHERENTE: 
      // El botón solo mete al usuario en la cola y lo lleva a la pantalla de espera de su token.
      // Toda la magia del acortador ocurre dentro de la página de la cola automáticamente.
      router.push(`/queue/${data.token}`)

    } catch (error) {
      console.error('Error handling download queue:', error)
      alert('An error occurred while adding to the download queue.')
    } finally {
      setLoading(false)
    }
  }

  const cls =
    variant === 'primary'
      ? 'flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors'
      : 'flex items-center gap-2 px-3 py-1.5 bg-secondary border border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 transition-colors'

  return (
    <button onClick={handleDownload} disabled={loading} className={cls}>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      <span>{label ?? 'Download'}</span>
      {fileSize && (
        <span className="text-xs opacity-70">({formatBytes(BigInt(fileSize))})</span>
      )}
    </button>
  )
}