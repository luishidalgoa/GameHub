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
  /** Bytes que han salido hacia el cliente, todas las peticiones (puede contar repetidos). */
  bytesSent: number
  /** Posición más lejana del archivo enviada: lo que cuenta para el progreso. */
  position: number
  fileSize: number
  /** Velocidad medida entre dos lecturas, en bytes por segundo. */
  bytesPerSecond: number
  /** Último byte enviado, en ms. */
  lastByteAt: number
  /** Inicio del intento, en ms. */
  startedAt: number
  now: number
}

export interface DownloadProgress {
  /** 0 a 1, según la posición del archivo. */
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
  const progress = Math.min(1, d.position / fileSize)
  const stalled = d.now - d.lastByteAt > STALLED_AFTER_MS
  const bytesPerSecond = stalled ? 0 : Math.max(0, d.bytesPerSecond)
  const remaining = Math.max(0, fileSize - d.position)
  const etaSeconds = bytesPerSecond > 0 ? Math.round(remaining / bytesPerSecond) : null
  // Un milisegundo de mínimo: la media de una descarga corta debe coincidir con la medida en vivo.
  const elapsedS = Math.max(0.001, (d.lastByteAt - d.startedAt) / 1000)
  return {
    progress,
    bytesPerSecond,
    etaSeconds,
    averageBps: Math.round(d.bytesSent / elapsedS),
    complete: d.position >= d.fileSize,
  }
}

/** Una lectura de bytes enviados en un instante, y la velocidad medida hasta la anterior. */
export interface SpeedSample {
  bytes: number
  at: number
  bytesPerSecond: number
}

/** Lecturas más cercanas que esto no sirven para medir: se conserva la anterior. */
const MIN_SPEED_WINDOW_MS = 1000

/**
 * Velocidad entre dos lecturas: bytes enviados desde la anterior dividido por el tiempo que pasó.
 * Mide lo que sale de verdad, sin importar cómo se reparten los tramos ni cuántas peticiones
 * en paralelo hay. Sin lectura anterior, o si pasó menos de un segundo, devuelve la anterior.
 */
export function measureSpeed(prev: SpeedSample | undefined, bytes: number, now: number): SpeedSample {
  if (!prev) return { bytes, at: now, bytesPerSecond: 0 }
  const elapsed = now - prev.at
  if (elapsed < MIN_SPEED_WINDOW_MS) return prev
  return {
    bytes,
    at: now,
    bytesPerSecond: Math.max(0, (bytes - prev.bytes) / (elapsed / 1000)),
  }
}

/**
 * Qué se descarga: el juego base (sin dlcId) o el tipo del complemento: dlc, update, mod o region.
 * Un tipo desconocido se devuelve tal cual, para no esconder una descarga nueva.
 */
export function downloadKindOf(dlcId: number | null, dlcType: string | null): string {
  if (dlcId === null) return 'base'
  return dlcType ?? 'dlc'
}

/** Nombre en pantalla del tipo de descarga. */
export function downloadKindLabel(kind: string): string {
  switch (kind) {
    case 'base': return 'Juego base'
    case 'dlc': return 'DLC'
    case 'update': return 'Actualización'
    case 'mod': return 'Mod'
    case 'region': return 'Edición regional'
    default: return kind
  }
}

/** Sin bytes durante este tiempo, una descarga cortada deja de ser «en pausa». */
export const PAUSED_AFTER_MS = 30 * 60 * 1000

/** Un intento de descarga tal como se guarda: una petición que empieza en byte 0 y sus reanudaciones. */
export interface AttemptRecord {
  id: number
  /** Identidad de la descarga: cliente, juego, complemento y archivo. */
  key: string
  fileSize: number
  bytesSent: number
  /** Posición más lejana del archivo. Las filas anteriores a esa medida usan los bytes enviados. */
  position: number
  startedAt: number
  /** Null si el intento no ha enviado todavía ningún byte. */
  lastByteAt: number | null
  /** El cliente terminó la petición. Las descargas de la cola no miden bytes y solo tienen esta marca. */
  completed: boolean
  /** Sin bytes medidos: la fila viene de una descarga que no pasa por el contador. */
  untracked: boolean
}

export type DownloadState = 'active' | 'complete' | 'paused' | 'cut'

export interface DownloadGroup {
  key: string
  /** Id del intento más reciente: de él salen el título y el tipo. */
  latestId: number
  attempts: number
  fileSize: number
  bytesSent: number
  position: number
  startedAt: number
  lastByteAt: number
  /** Segundos que cada intento estuvo transfiriendo (sin las pausas entre intentos). */
  transferSeconds: number
  state: DownloadState
}

/** La posición que cuenta para una fila: la medida, o los bytes enviados si la fila es anterior a ella. */
export function positionOf(frontier: number, bytesSent: number): number {
  return frontier > 0 ? frontier : bytesSent
}

/** Una fila de DownloadLog con lo necesario para agrupar sus intentos. */
export interface AttemptRow {
  id: number
  gameId: number
  ip: string
  dlcId: number | null
  fileName: string
  fileSize: bigint | number
  bytesSent: bigint | number
  frontier: bigint | number
  completed: boolean
  startedAt: Date
  lastByteAt: Date | null
}

/**
 * Descargas completas por juego. Un juego que se para y se reanuda, o que el cliente reintenta,
 * son varios intentos de una misma descarga: cuenta una vez, cuando llega al final del archivo.
 */
export function completedDownloadsByGame(rows: AttemptRow[], now: number): Map<number, number> {
  const records: AttemptRecord[] = rows.map(r => ({
    id: r.id,
    key: `${r.ip}|${r.gameId}|${r.dlcId ?? ''}|${r.fileName}`,
    fileSize: Number(r.fileSize),
    bytesSent: Number(r.bytesSent),
    position: positionOf(Number(r.frontier), Number(r.bytesSent)),
    startedAt: r.startedAt.getTime(),
    lastByteAt: r.lastByteAt ? r.lastByteAt.getTime() : null,
    completed: r.completed,
    untracked: Number(r.bytesSent) === 0 && Number(r.frontier) === 0,
  }))
  const gameOf = new Map(rows.map(r => [r.id, r.gameId]))
  const counts = new Map<number, number>()
  for (const group of groupAttempts(records, now)) {
    if (group.position < group.fileSize) continue
    const gameId = gameOf.get(group.latestId)
    if (gameId === undefined) continue
    counts.set(gameId, (counts.get(gameId) ?? 0) + 1)
  }
  return counts
}

/**
 * Une los intentos de una misma descarga y decide su estado. Activa si algún intento recibe
 * bytes; completa si la posición más lejana llega al final del archivo; en pausa si lleva
 * menos de PAUSED_AFTER_MS sin bytes; cortada en otro caso.
 */
export function groupAttempts(rows: AttemptRecord[], now: number): DownloadGroup[] {
  const byKey = new Map<string, AttemptRecord[]>()
  for (const r of rows) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r])

  const groups: DownloadGroup[] = []
  for (const [key, attempts] of byKey) {
    const sorted = [...attempts].sort((a, b) => b.startedAt - a.startedAt)
    const latest = sorted[0]
    const lastByteAt = Math.max(...attempts.map(a => a.lastByteAt ?? a.startedAt))
    const fileSize = Math.max(...attempts.map(a => a.fileSize))
    // Una descarga sin contador que el cliente dio por terminada cuenta como entera.
    const position = Math.max(...attempts.map(a =>
      a.untracked && a.completed ? a.fileSize : a.position))
    const transferSeconds = attempts.reduce(
      (sum, a) => sum + Math.max(0, (a.lastByteAt ?? a.startedAt) - a.startedAt) / 1000, 0)
    const idle = now - lastByteAt
    let state: DownloadState
    if (idle <= IDLE_AFTER_MS) state = 'active'
    else if (position >= fileSize) state = 'complete'
    else if (idle < PAUSED_AFTER_MS) state = 'paused'
    else state = 'cut'
    groups.push({
      key,
      latestId: latest.id,
      attempts: attempts.length,
      fileSize,
      bytesSent: attempts.reduce((sum, a) => sum + a.bytesSent, 0),
      position,
      startedAt: Math.min(...attempts.map(a => a.startedAt)),
      lastByteAt,
      transferSeconds,
      state,
    })
  }
  return groups.sort((a, b) => b.lastByteAt - a.lastByteAt)
}
