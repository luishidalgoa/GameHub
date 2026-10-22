'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

export interface CompanyRow { id: number; name: string; games: number }

/**
 * Fusión de editoras duplicadas (#143). Primero se elige la que sobra («Usar como origen»),
 * después la que queda («Fusionar aquí»). Se confirma antes de mover nada.
 */
export function CompanyMerge({ rows }: { rows: CompanyRow[] }) {
  const router = useRouter()
  const [from, setFrom] = useState<CompanyRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function mergeInto(into: CompanyRow) {
    if (!from) return
    if (!window.confirm(`¿Fusionar «${from.name}» (${from.games} juegos) en «${into.name}»? Los juegos pasan a «${into.name}» y «${from.name}» deja de existir como editora.`)) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/catalog/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from.id, into: into.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? String(res.status))
      setMessage({ ok: true, text: `Fusionada «${from.name}» en «${into.name}»: ${data.games} juegos movidos.` })
      setFrom(null)
      router.refresh()
    } catch (err) {
      setMessage({ ok: false, text: `No se pudo fusionar: ${err instanceof Error ? err.message : 'error'}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {from && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-violet-700/60 bg-violet-950/20 px-4 py-3 text-sm">
          <span>Origen: <strong>{from.name}</strong> ({from.games} juegos). Elige en qué editora queda.</span>
          <button type="button" onClick={() => setFrom(null)} disabled={busy} className="px-3 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-xs">Cancelar</button>
        </div>
      )}
      {message && <p role="status" className={`text-sm ${message.ok ? 'text-green-500' : 'text-destructive'}`}>{message.text}</p>}

      <ul className="divide-y divide-border">
        {rows.map(row => {
          const isOrigin = from?.id === row.id
          return (
            <li key={row.id} className="py-2 flex items-center gap-3">
              <span className="flex-1 min-w-0 truncate" title={row.name}>{row.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{row.games} juegos</span>
              {from && !isOrigin ? (
                <button type="button" onClick={() => mergeInto(row)} disabled={busy} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-60">
                  {busy && <RefreshCw className="w-3.5 h-3.5 animate-spin" />} Fusionar aquí
                </button>
              ) : !from ? (
                <button type="button" onClick={() => setFrom(row)} disabled={busy} className="px-3 py-1.5 rounded-md text-xs bg-secondary hover:bg-secondary/80 disabled:opacity-60">
                  Usar como origen
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
