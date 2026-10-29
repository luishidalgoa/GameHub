import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getRateLimitAlerts, parseUaDetail } from '@/lib/tracker'
import { adminGuard } from '@/lib/admin-guard'
import { downloadKindOf, downloadProgress, errorPercent, IDLE_AFTER_MS, measureSpeed, type SpeedSample } from '@/lib/traffic-stats'

export const dynamic = 'force-dynamic'

const ACTIVE_WINDOW_MS = 5 * 60 * 1000
const ERRORS_WINDOW_MS = 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const downloadSelect = {
  id: true, gameId: true, dlcId: true, dlcType: true, fileName: true, fileSize: true, bytesSent: true, frontier: true,
  lastByteAt: true, startedAt: true, client: true, clientVersion: true,
  game: { select: { title: true } },
} as const

/** Una descarga con su progreso, velocidad y tiempo restante, lista para la pantalla. */
type DownloadRecord = {
  id: number; gameId: number; dlcId: number | null; dlcType: string | null; fileName: string; fileSize: bigint
  bytesSent: bigint; frontier: bigint; lastByteAt: Date | null; startedAt: Date
  client: string | null; clientVersion: string | null; game: { title: string }
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

  const [activeNow, requests1h, errors1h, recentRequests, recentSearches, rateLimitAlerts, activeRows, finishedRows] = await Promise.all([
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
    db.downloadLog.findMany({
      where: { lastByteAt: { gte: dayAgo, lt: idleBefore }, bytesSent: { gt: BigInt(0) } },
      orderBy: { lastByteAt: 'desc' },
      take: 30,
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

  const dlcTitles = await dlcTitlesFor([...activeRows, ...finishedRows])

  return NextResponse.json({
    activeNow: activeNow.length,
    requests1h,
    errors1h,
    errorPercent: errorPercent(requests1h, errors1h),
    recentRequests: enrichedRequests,
    recentSearches: recentSearches.map((s) => ({ ...s, ts: s.ts.toISOString() })),
    rateLimitAlerts,
    activeDownloads: activeRows.map((r) => toDownloadRow(r, now, dlcTitles)),
    finishedDownloads: finishedRows.map((r) => toDownloadRow(r, now, dlcTitles)),
  })
}
