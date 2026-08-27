'use client'

import { useState } from 'react'
import { AlertTriangle, FileX, Loader2, PackagePlus, RefreshCw, ShieldCheck } from 'lucide-react'

type Kind = 'update' | 'dlc' | 'unreadable'

interface Issue {
  id: number
  title: string
  fileName: string
  filePath: string
  platform: string
  kind: Kind
  detail: string
}

interface Result { issues: Issue[]; scanned: number }

const KIND: Record<Kind, { label: string; className: string; Icon: typeof FileX }> = {
  unreadable: {
    label: 'No se puede leer',
    className: 'bg-rose-600/15 text-rose-400 border-rose-600/30',
    Icon: FileX,
  },
  update: {
    label: 'Es una actualización',
    className: 'bg-amber-600/15 text-amber-400 border-amber-600/30',
    Icon: PackagePlus,
  },
  dlc: {
    label: 'Es un DLC',
    className: 'bg-sky-600/15 text-sky-400 border-sky-600/30',
    Icon: PackagePlus,
  },
}

/**
 * Filas que la web afirma y no puede sostener: un parche catalogado como juego
 * dice que hay algo jugable que no lo es, y una ficha cuyo fichero no se puede
 * leer dice que hay algo descargable que no está.
 *
 * Se pide a mano, no en cada carga: la comprobación hace un stat por juego de
 * toda la biblioteca.
 */
export function LibraryIssuesPanel() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')

  const run = async () => {
    if (running) return
    setRunning(true)
    setResult(null)
    setError('')
    try {
      const res = await fetch('/api/admin/library-issues')
      const data = await res.json()
      if (!res.ok) setError(data.error ?? 'La comprobación falló')
      else setResult(data as Result)
    } catch {
      setError('Error de red')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-muted-foreground" />
            Integridad de la biblioteca
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Busca fichas cuyo fichero no se puede leer y parches o DLC
            catalogados como si fueran juegos. Recorre la biblioteca entera,
            así que tarda.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-50 text-sm font-medium whitespace-nowrap"
        >
          {running
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <RefreshCw className="w-4 h-4" />}
          Comprobar
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}

      {result && result.issues.length === 0 && (
        <p className="mt-4 text-sm text-emerald-400 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          {result.scanned} fichas revisadas, ninguna con problemas.
        </p>
      )}

      {result && result.issues.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-muted-foreground">
            {result.issues.length} de {result.scanned} fichas necesitan una
            revisión.
          </p>
          <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
            {result.issues.map((issue) => {
              const kind = KIND[issue.kind]
              return (
                <a
                  key={issue.id}
                  href={`/admin/games/${issue.id}`}
                  className="flex items-start gap-3 bg-secondary/40 hover:bg-secondary/70 rounded-lg px-3 py-2.5 transition-colors"
                >
                  <kind.Icon className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{issue.title}</span>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded border ${kind.className}`}>
                        {kind.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{issue.platform}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{issue.detail}</p>
                    {/* La ruta completa: sin ella no se sabe cual de dos discos
                        es el que falla. */}
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5 font-mono truncate">
                      {issue.filePath}
                    </p>
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
