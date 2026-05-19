'use client'

import { useEffect, useState } from 'react'
import { X, Gamepad2, Package, RefreshCw, Wrench, AlertCircle, Loader2 } from 'lucide-react'

interface PlatformScanSummary {
  platform:     string
  gamesAdded:   number
  gamesUpdated: number
  gamesStale:   number
  dlcsFound:    number
  updatesFound: number
  modsFound:    number
}

interface ScanLog {
  id:                number
  startedAt:         string
  finishedAt:        string | null
  gamesFound:        number
  gamesAdded:        number
  gamesUpdated:      number
  gamesStale:        number
  triggeredBy:       string
  errors:            string | null
  platformBreakdown: string | null
}

interface Props {
  logId: number
  onClose: () => void
}

export function ScanLogModal({ logId, onClose }: Props) {
  const [log, setLog]       = useState<ScanLog | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/admin/scan-logs/${logId}`)
      .then(r => r.json())
      .then(data => { setLog(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [logId])

  const breakdown: PlatformScanSummary[] = log?.platformBreakdown
    ? JSON.parse(log.platformBreakdown)
    : []

  const errors: string[] = log?.errors ? JSON.parse(log.errors) : []

  const duration = log?.finishedAt
    ? `${Math.round((new Date(log.finishedAt).getTime() - new Date(log.startedAt).getTime()) / 1000)}s`
    : '—'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div>
            <h2 className="font-semibold text-lg">Detalle del escaneo #{logId}</h2>
            {log && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {new Date(log.startedAt).toLocaleString()} · {duration} · {log.triggeredBy}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 space-y-5 flex-1">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Cargando...</span>
            </div>
          )}

          {!loading && log && (
            <>
              {/* Totals row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SummaryChip icon={<Gamepad2 className="w-4 h-4" />} label="Encontrados" value={log.gamesFound} color="text-foreground" />
                <SummaryChip icon={<Gamepad2 className="w-4 h-4" />} label="Añadidos"    value={log.gamesAdded}   color="text-green-500" />
                <SummaryChip icon={<RefreshCw className="w-4 h-4" />} label="Actualizados" value={log.gamesUpdated} color="text-blue-500" />
                <SummaryChip icon={<Gamepad2 className="w-4 h-4" />} label="Obsoletos"   value={log.gamesStale}   color="text-amber-500" />
              </div>

              {/* Per-platform table */}
              {breakdown.length > 0 ? (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Desglose por plataforma</h3>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/40 text-left text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Plataforma</th>
                          <th className="px-3 py-2 font-medium text-green-500 text-center">
                            <span className="flex items-center justify-center gap-1"><Gamepad2 className="w-3.5 h-3.5" />Juegos+</span>
                          </th>
                          <th className="px-3 py-2 font-medium text-blue-500 text-center">
                            <span className="flex items-center justify-center gap-1"><RefreshCw className="w-3.5 h-3.5" />Actualizados</span>
                          </th>
                          <th className="px-3 py-2 font-medium text-amber-500 text-center">
                            <span className="flex items-center justify-center gap-1"><Gamepad2 className="w-3.5 h-3.5" />Obsoletos</span>
                          </th>
                          <th className="px-3 py-2 font-medium text-purple-400 text-center">
                            <span className="flex items-center justify-center gap-1"><Package className="w-3.5 h-3.5" />DLC</span>
                          </th>
                          <th className="px-3 py-2 font-medium text-sky-400 text-center">
                            <span className="flex items-center justify-center gap-1"><RefreshCw className="w-3.5 h-3.5" />Updates</span>
                          </th>
                          <th className="px-3 py-2 font-medium text-rose-400 text-center">
                            <span className="flex items-center justify-center gap-1"><Wrench className="w-3.5 h-3.5" />Mods</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdown.map((row) => (
                          <tr key={row.platform} className="border-t border-border hover:bg-muted/20 transition-colors">
                            <td className="px-3 py-2 font-medium">{row.platform}</td>
                            <td className="px-3 py-2 text-center text-green-500">{row.gamesAdded > 0   ? `+${row.gamesAdded}`   : <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-3 py-2 text-center text-blue-500">{row.gamesUpdated > 0 ? row.gamesUpdated       : <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-3 py-2 text-center text-amber-500">{row.gamesStale > 0  ? row.gamesStale         : <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-3 py-2 text-center text-purple-400">{row.dlcsFound > 0   ? row.dlcsFound          : <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-3 py-2 text-center text-sky-400">{row.updatesFound > 0   ? row.updatesFound       : <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-3 py-2 text-center text-rose-400">{row.modsFound > 0     ? row.modsFound          : <span className="text-muted-foreground">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No hay desglose por plataforma disponible (este escaneo es anterior a la actualización).
                </p>
              )}

              {/* Errors */}
              {errors.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    Errores ({errors.length})
                  </h3>
                  <div className="bg-red-950/30 border border-red-900/40 rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto">
                    {errors.map((e, i) => (
                      <p key={i} className="text-xs text-red-300 font-mono">{e}</p>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!loading && !log && (
            <p className="text-sm text-muted-foreground text-center py-8">No se pudo cargar el escaneo.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryChip({
  icon, label, value, color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
}) {
  return (
    <div className="bg-muted/30 border border-border rounded-lg px-3 py-2.5 flex items-center gap-2">
      <span className={`${color} shrink-0`}>{icon}</span>
      <div className="min-w-0">
        <p className={`font-bold text-lg leading-none ${color}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{label}</p>
      </div>
    </div>
  )
}
