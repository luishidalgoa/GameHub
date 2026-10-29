/**
 * Pure helpers behind the traffic screen. No database access here, so the
 * rules (what counts as abandoned, when a rate is undefined, which days have
 * no data) can be tested without a database.
 */

/** A download row still open after this long is counted as abandoned, not in progress. */
export const ABANDON_AFTER_MS = 6 * 60 * 60 * 1000

/**
 * Share of closed download rows that finished. Rows still in progress are not
 * closed yet, so they are left out. Returns null when nothing has closed: a 0 %
 * there would read as failure when it only means "not yet".
 */
export function successPercent(completed: number, abandoned: number): number | null {
  const closed = completed + abandoned
  if (closed === 0) return null
  return Math.round((completed / closed) * 100)
}

/** Share of responses that were 5xx, to one decimal. Null without requests. */
export function errorPercent(total: number, errors: number): number | null {
  if (total === 0) return null
  return Math.round((errors / total) * 1000) / 10
}

/** Local midnight of each of the last `days` days, oldest first, today last. */
export function dayStarts(now: Date, days: number): Date[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (days - 1 - i))
    return d
  })
}

/**
 * Count of timestamps per day in `starts`. A day that begins before `since`
 * (the oldest row still kept) yields null, not zero: those rows may have been
 * deleted by retention, so zero would claim a quiet day that nobody measured.
 */
export function countByDay(dates: Date[], starts: Date[], since: Date | null): Array<number | null> {
  return starts.map((start, i) => {
    const end = i + 1 < starts.length
      ? starts[i + 1]
      : new Date(start.getTime() + 24 * 60 * 60 * 1000)
    if (since === null || start.getTime() < since.getTime()) return null
    return dates.filter((d) => d >= start && d < end).length
  })
}

/** Sin bytes durante este tiempo, una descarga cuenta como parada: su velocidad es 0. */
export const STALLED_AFTER_MS = 10 * 1000

/** Sin bytes durante este tiempo, una descarga sale de «activas» y pasa al resumen. */
export const IDLE_AFTER_MS = 60 * 1000

export interface DownloadProgressInput {
  bytesSent: number
  fileSize: number
  /** Velocidad del último tramo guardado, en bytes por segundo. */
  speedBps: number | null
  /** Último byte enviado, en ms. */
  lastByteAt: number
  /** Inicio del intento, en ms. */
  startedAt: number
  now: number
}

export interface DownloadProgress {
  /** 0 a 1. */
  progress: number
  /** Velocidad ahora: 0 si lleva parada más de STALLED_AFTER_MS. */
  bytesPerSecond: number
  /** Segundos que faltan a la velocidad de ahora, o null si no hay velocidad. */
  etaSeconds: number | null
  /** Velocidad media del intento desde su inicio, en bytes por segundo. */
  averageBps: number
  complete: boolean
}

/** Progreso, velocidad y tiempo restante de una descarga. Pura: se prueba sin base de datos. */
export function downloadProgress(d: DownloadProgressInput): DownloadProgress {
  const fileSize = Math.max(1, d.fileSize)
  const progress = Math.min(1, d.bytesSent / fileSize)
  const stalled = d.now - d.lastByteAt > STALLED_AFTER_MS
  const bytesPerSecond = stalled ? 0 : (d.speedBps ?? 0)
  const remaining = Math.max(0, fileSize - d.bytesSent)
  const etaSeconds = bytesPerSecond > 0 ? Math.round(remaining / bytesPerSecond) : null
  // Un milisegundo de mínimo: la media de una descarga corta debe coincidir con la medida en vivo.
  const elapsedS = Math.max(0.001, (d.lastByteAt - d.startedAt) / 1000)
  return {
    progress,
    bytesPerSecond,
    etaSeconds,
    averageBps: Math.round(d.bytesSent / elapsedS),
    complete: d.bytesSent >= d.fileSize,
  }
}
