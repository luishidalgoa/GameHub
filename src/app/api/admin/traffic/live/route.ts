import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getRateLimitAlerts, parseUaDetail } from '@/lib/tracker'
import { adminGuard } from '@/lib/admin-guard'
import { downloadKindOf, downloadProgress, errorPercent, groupAttempts, IDLE_AFTER_MS, measureSpeed, positionOf, type AttemptRecord, type SpeedSample } from '@/lib/traffic-stats'

export const dynamic = 'force-dynamic'

const ACTIVE_WINDOW_MS = 5 * 60 * 1000
const ERRORS_WINDOW_MS = 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const downloadSelect = {
  id: true, ip: true, gameId: true, dlcId: true, dlcType: true, fileName: true, fileSize: true, bytesSent: true, frontier: true, completed: true,
  lastByteAt: true, startedAt: true, client: true, clientVersion: true,
  clientId: true, device: true, browser: true,
  game: { select: { title: true } },
} as const

/** Una descarga con su progreso, velocidad y tiempo restante, lista para la pantalla. */
type DownloadRecord = {
  id: number; gameId: number; dlcId: number | null; dlcType: string | null; fileName: string; fileSize: bigint
  ip: string; bytesSent: bigint; frontier: bigint; completed: boolean; lastByteAt: Date | null; startedAt: Date
  client: string | null; clientVersion: string | null; clientId: string | null; device: string | null; browser: string | null
  game: { title: string }
}

/** Nombre de los DLC, actualizaciones y mods de las filas: el título del fichero si lo tiene, si no el nombre. */
async function dlcTitlesFor(rows: DownloadRecord[]): Promise<Map<number, string>> {
  const ids = [...new Set(rows.map((r) => r.dlcId).filter((id): id is number => id !== null))]
  if (ids.length === 0) return new Map()
  const dlcs = await db.gameDlc.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, fileName: true } })
  return new Map(dlcs.map((d) => [d.id, d.title ?? d.fileName]))
}

/** Última lectura de bytes por descarga: la velocidad sale de dos lecturas, no del último tramo. */
const speedSamples = new Map<number, SpeedSample>()

/** Velocidad de una descarga medida desde la lectura anterior de esta misma pantalla. */
function speedOf(id: number, bytesSent: number, now: number): number {
  const sample = measureSpeed(speedSamples.get(id), bytesSent, now)
  speedSamples.set(id, sample)
  // Las descargas que llevan una hora sin movimiento salen de la memoria.
  if (speedSamples.size > 500) {
    for (const [key, s] of speedSamples) if (now - s.at > 60 * 60 * 1000) speedSamples.delete(key)
  }
  return sample.bytesPerSecond
}

function toDownloadRow(r: DownloadRecord, now: number, dlcTitles: Map<number, string>) {
  const lastByteAt = (r.lastByteAt ?? r.startedAt).getTime()
  const bytesSent = Number(r.bytesSent)
  const p = downloadProgress({
    bytesSent, position: Number(r.frontier), fileSize: Number(r.fileSize),
    bytesPerSecond: speedOf(r.id, bytesSent, now),
    lastByteAt, startedAt: r.startedAt.getTime(), now,
  })
  return {
    id: r.id,
    gameId: r.gameId,
    title: r.game.title,
    kind: downloadKindOf(r.dlcId, r.dlcType),
    dlcTitle: r.dlcId === null ? null : (dlcTitles.get(r.dlcId) ?? null),
    fileName: r.fileName,
    client: r.client,
    clientVersion: r.clientVersion,
    clientId: r.clientId,
    ip: r.ip,
    device: r.device,
    browser: r.browser,
    fileSize: Number(r.fileSize),
    bytesSent: Number(r.bytesSent),
    ...p,
    startedAt: r.startedAt.toISOString(),
    lastByteAt: new Date(lastByteAt).toISOString(),
  }
}

/** Lightweight endpoint: only the data that changes second to second. */
export async function GET() {
  const denied = await adminGuard()
  if (denied) return denied

  const now = Date.now()
  const activeSince = new Date(now - ACTIVE_WINDOW_MS)
  const errorsSince = new Date(now - ERRORS_WINDOW_MS)

  const idleBefore = new Date(now - IDLE_AFTER_MS)
  const dayAgo = new Date(now - DAY_MS)

  const [activeNow, requests1h, errors1h, recentRequests, recentSearches, rateLimitAlerts, activeRows, windowRows] = await Promise.all([
    db.requestLog.findMany({
      where: { ts: { gte: activeSince } },
      select: { ip: true },
      distinct: ['ip'],
    }),

    db.requestLog.count({ where: { ts: { gte: errorsSince } } }),

    db.requestLog.count({ where: { ts: { gte: errorsSince }, status: { gte: 500 } } }),

    db.requestLog.findMany({
      orderBy: { ts: 'desc' },
      take: 50,
      select: { id: true, path: true, status: true, device: true, browser: true, durationMs: true, ts: true, bytes: true, userAgent: true },
    }),

    db.searchLog.findMany({
      orderBy: { ts: 'desc' },
      take: 30,
      select: { id: true, query: true, ip: true, results: true, ts: true },
    }),

    getRateLimitAlerts(),

    // Descargas con bytes en el último minuto: en curso.
    db.downloadLog.findMany({
      where: { OR: [{ lastByteAt: { gte: idleBefore } }, { lastByteAt: null, startedAt: { gte: idleBefore } }] },
      orderBy: { lastByteAt: 'desc' },
      take: 50,
      select: downloadSelect,
    }),

    // Descargas que se pararon en las últimas 24 h: resumen de las que acabaron o se cortaron.
    // Intentos de las últimas 24 h con actividad o terminados: se agrupan por descarga abajo.
    // Los más recientes primero, así el límite no corta las descargas que siguen en curso.
    db.downloadLog.findMany({
      where: {
        AND: [
          { OR: [{ lastByteAt: { gte: dayAgo } }, { lastByteAt: null, startedAt: { gte: dayAgo } }] },
          { OR: [{ bytesSent: { gt: BigInt(0) } }, { completed: true }] },
        ],
      },
      orderBy: { lastByteAt: 'desc' },
      take: 500,
      select: downloadSelect,
    }),
  ])

  const enrichedRequests = recentRequests.map((r) => {
    const d = parseUaDetail(r.userAgent ?? '')
    return {
      ...r,
      ts: r.ts.toISOString(),
      os: d.os,
      osVersion: d.osVersion,
      deviceModel: d.deviceModel,
    }
  })

  // Las activas van siempre al agrupado, aunque el límite de la ventana las hubiera dejado fuera.
  const attemptRows = [...new Map([...activeRows, ...windowRows].map((r) => [r.id, r])).values()]
  const dlcTitles = await dlcTitlesFor(attemptRows)

  // Un intento se identifica por su IP, juego, complemento y archivo; las reanudaciones
  // y las pausas de una misma descarga caen en el mismo grupo.
  const attemptKey = (r: DownloadRecord) => `${r.ip}|${r.gameId}|${r.dlcId ?? ''}|${r.fileName}`
  const recordById = new Map(attemptRows.map((r) => [r.id, r]))
  const records: AttemptRecord[] = attemptRows.map((r) => ({
    id: r.id,
    key: attemptKey(r),
    fileSize: Number(r.fileSize),
    bytesSent: Number(r.bytesSent),
    position: positionOf(Number(r.frontier), Number(r.bytesSent)),
    startedAt: r.startedAt.getTime(),
    lastByteAt: r.lastByteAt ? r.lastByteAt.getTime() : null,
    completed: r.completed,
    untracked: Number(r.bytesSent) === 0 && Number(r.frontier) === 0,
  }))
  const finishedDownloads = groupAttempts(records, now)
    .filter((g) => g.state !== 'active')
    .slice(0, 30)
    .map((g) => {
      const row = toDownloadRow(recordById.get(g.latestId)!, now, dlcTitles)
      const transfer = Math.max(0.001, g.transferSeconds)
      return {
        ...row,
        state: g.state,
        attempts: g.attempts,
        fileSize: g.fileSize,
        bytesSent: g.bytesSent,
        position: g.position,
        progress: Math.min(1, g.position / Math.max(1, g.fileSize)),
        complete: g.state === 'complete',
        transferSeconds: Math.round(g.transferSeconds),
        averageBps: Math.round(g.bytesSent / transfer),
        startedAt: new Date(g.startedAt).toISOString(),
        lastByteAt: new Date(g.lastByteAt).toISOString(),
      }
    })

  return NextResponse.json({
    activeNow: activeNow.length,
    requests1h,
    errors1h,
    errorPercent: errorPercent(requests1h, errors1h),
    recentRequests: enrichedRequests,
    recentSearches: recentSearches.map((s) => ({ ...s, ts: s.ts.toISOString() })),
    rateLimitAlerts,
    activeDownloads: activeRows.map((r) => toDownloadRow(r, now, dlcTitles)),
    finishedDownloads,
  })
}
