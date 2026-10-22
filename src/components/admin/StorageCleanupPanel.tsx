'use client'

import { useState } from 'react'
import { Archive, RefreshCw, Trash2 } from 'lucide-react'

// What cleanupStorage reports (src/lib/storage-cleanup.ts).
interface CleanupReport {
  dryRun: boolean
  pointersCleared: number
  objects: number
  referenced: number
  orphans: number
  orphanMB: number
  deleted: number
  sample: string[]
}

/**
 * Limpieza del almacén de objetos (#142). Primero se simula: cuenta lo que no
 * referencia ningún juego ni fichero y no borra nada. La limpieza real solo se
 * ofrece después de simular, y pide confirmación.
 */
export function StorageCleanupPanel() {
  const [report, setReport] = useState<CleanupReport | null>(null)
  const [busy, setBusy] = useState<'simulate' | 'clean' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(dryRun: boolean) {
    setBusy(dryRun ? 'simulate' : 'clean')
    setError(null)
    try {
      const res = await fetch('/api/admin/storage/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setReport(await res.json())
    } catch {
      setError('No se pudo completar la operación. Revisa el servidor de almacenamiento.')
    } finally {
      setBusy(null)
    }
  }

  function clean() {
    if (!report) return
    const ok = window.confirm(
      `Se borrarán ${report.orphans} objetos (${report.orphanMB} MB) que nada referencia, ` +
      'y se quitarán los punteros de snapshots libretro. Esto no se puede deshacer.',
    )
    if (ok) run(false)
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Archive className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <h3 className="font-semibold">Objetos huérfanos del almacén</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ficheros del bucket que ningún juego ni fichero referencia. Antes de borrar, simula: no toca nada.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => run(true)}
          disabled={busy !== null}
          className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 disabled:opacity-50 rounded-md text-sm font-medium transition-colors"
        >
          {busy === 'simulate' ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
          Simular limpieza
        </button>
        {report && report.dryRun && report.orphans > 0 && (
          <button
            onClick={clean}
            disabled={busy !== null}
            className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 rounded-md text-sm font-medium transition-colors"
          >
            {busy === 'clean' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Limpiar {report.orphans} objetos
          </button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {report && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([
              ['Objetos', report.objects],
              ['Referenciados', report.referenced],
              ['Huérfanos', report.orphans],
              ['Tamaño (MB)', report.orphanMB],
            ] as const).map(([label, n]) => (
              <div key={label} className="bg-secondary rounded-md px-3 py-2">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-lg font-semibold tabular-nums">{n}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {report.dryRun
              ? 'Simulación: no se ha borrado nada.'
              : `Borrados ${report.deleted} objetos; punteros libretro quitados: ${report.pointersCleared}.`}
          </p>
          {report.sample.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Ejemplos</summary>
              <div className="mt-1 font-mono break-all space-y-0.5">
                {report.sample.map(k => <div key={k}>{k}</div>)}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
