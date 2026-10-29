import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getRateLimitAlerts, parseUaDetail } from '@/lib/tracker'
import { adminGuard } from '@/lib/admin-guard'
import { downloadProgress, errorPercent, IDLE_AFTER_MS } from '@/lib/traffic-stats'

export const dynamic = 'force-dynamic'

const ACTIVE_WINDOW_MS = 5 * 60 * 1000
const ERRORS_WINDOW_MS = 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const downloadSelect = {
  id: true, gameId: true, fileName: true, fileSize: true, bytesSent: true, speedBps: true,
  lastByteAt: true, startedAt: true, client: true, clientVersion: true,
  game: { select: { title: true } },
} as const

/** Una descarga con su progreso, velocidad y tiempo restante, lista para la pantalla. */
function toDownloadRow(r: {
  id: number; gameId: number; fileName: string; fileSize: bigint; bytesSent: bigint; speedBps: number | null
  lastByteAt: Date | null; startedAt: Date; client: string | null; clientVersion: string | null
  game: { title: string }
}, now: number) {
  const lastByteAt = (r.lastByteAt ?? r.startedAt).getTime()
  const p = downloadProgress({
    bytesSent: Number(r.bytesSent), fileSize: Number(r.fileSize), speedBps: r.speedBps,
    lastByteAt, startedAt: r.startedAt.getTime(), now,
  })
  return {
    id: r.id,
    gameId: r.gameId,
    title: r.game.title,
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

  return NextResponse.json({
    activeNow: activeNow.length,
    requests1h,
    errors1h,
    errorPercent: errorPercent(requests1h, errors1h),
    recentRequests: enrichedRequests,
    recentSearches: recentSearches.map((s) => ({ ...s, ts: s.ts.toISOString() })),
    rateLimitAlerts,
    activeDownloads: activeRows.map((r) => toDownloadRow(r, now)),
    finishedDownloads: finishedRows.map((r) => toDownloadRow(r, now)),
  })
}
