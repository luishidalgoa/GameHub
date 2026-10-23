import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getRateLimitAlerts, parseUaDetail } from '@/lib/tracker'
import { adminGuard } from '@/lib/admin-guard'
import { RETENTION_DAYS } from '@/lib/retention'
import { trustProxy } from '@/lib/net'
import { ABANDON_AFTER_MS, countByDay, dayStarts, successPercent } from '@/lib/traffic-stats'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Datos de la pantalla de trafico que cambian poco. Lo que se mueve segundo a
 * segundo (activos, errores, ultimas peticiones) va en /traffic/live.
 *
 * Las descargas se cuentan por tramo: cada fila de DownloadLog es una peticion
 * de descarga, no una sesion completa. Hasta que exista el modelo de sesiones
 * (fase 4 del plan) la pantalla lo dice en lugar de presentarlo como sesiones.
 */
export async function GET() {
  const denied = await adminGuard()
  if (denied) return denied

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS)
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS)
  const abandonedBefore = new Date(now.getTime() - ABANDON_AFTER_MS)
  const days = dayStarts(now, 7)

  const [
    pageViewsToday,
    uniqueVisitorsToday,
    oldestRequest,
    recentWeekRequests,
    recentIps,
    recentSearches,
    completedByClient,
    abandonedByClient,
    inProgressByClient,
    topGamesRaw,
    clientVersionsRaw,
    recentDiagnostics,
    rateLimitAlerts,
  ] = await Promise.all([
    db.requestLog.count({ where: { ts: { gte: todayStart } } }),

    db.requestLog.findMany({
      where: { ts: { gte: todayStart } },
      select: { ip: true },
      distinct: ['ip'],
    }),

    db.requestLog.aggregate({ _min: { ts: true } }),

    db.requestLog.findMany({
      where: { ts: { gte: days[0] } },
      select: { ts: true },
    }),

    // IP registry: last week, one row per address, same period as the IP retention.
    db.requestLog.findMany({
      where: { ts: { gte: weekAgo } },
      select: { ip: true, userAgent: true, device: true, browser: true, ts: true },
      orderBy: { ts: 'desc' },
      distinct: ['ip'],
      take: 30,
    }),

    db.searchLog.findMany({
      orderBy: { ts: 'desc' },
      take: 30,
      select: { id: true, query: true, ip: true, results: true, ts: true },
    }),

    // The three groupBy calls split the same 30 days by state, per client. A row
    // is abandoned after ABANDON_AFTER_MS without finishing, not before.
    db.downloadLog.groupBy({
      by: ['client'],
      where: { dlcId: null, completed: true, startedAt: { gte: monthAgo } },
      _count: { _all: true },
    }),
    db.downloadLog.groupBy({
      by: ['client'],
      where: { dlcId: null, completed: false, startedAt: { gte: monthAgo, lt: abandonedBefore } },
      _count: { _all: true },
    }),
    db.downloadLog.groupBy({
      by: ['client'],
      where: { dlcId: null, completed: false, startedAt: { gte: abandonedBefore } },
      _count: { _all: true },
    }),

    db.downloadLog.groupBy({
      by: ['gameId'],
      where: { dlcId: null, completed: true, startedAt: { gte: monthAgo } },
      _count: { _all: true },
      orderBy: { _count: { gameId: 'desc' } },
      take: 10,
    }),

    db.downloadLog.groupBy({
      by: ['clientVersion'],
      where: { clientVersion: { not: null }, dlcId: null, startedAt: { gte: monthAgo } },
      _count: { _all: true },
      orderBy: { _count: { clientVersion: 'desc' } },
      take: 10,
    }),

    // Fallos que comunica GameHubNX, los ultimos 20.
    db.clientDiagnostic.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { createdAt: true, kind: true, message: true, clientVersion: true },
    }),

    getRateLimitAlerts(),
  ])

  // ── Visitas por dia (7 dias). Un dia anterior al registro mas antiguo es null.
  const since = oldestRequest._min.ts
  const pageViewsByDay = countByDay(recentWeekRequests.map((r) => r.ts), days, since)

  // ── Descargas por cliente (30 dias)
  const clientNames = new Set<string | null>([
    ...completedByClient.map((r) => r.client),
    ...abandonedByClient.map((r) => r.client),
    ...inProgressByClient.map((r) => r.client),
  ])
  const byClient = [...clientNames].map((client) => {
    const completed = completedByClient.find((r) => r.client === client)?._count._all ?? 0
    const abandoned = abandonedByClient.find((r) => r.client === client)?._count._all ?? 0
    const inProgress = inProgressByClient.find((r) => r.client === client)?._count._all ?? 0
    return {
      client: client ?? 'unknown',
      completed,
      abandoned,
      inProgress,
      successPercent: successPercent(completed, abandoned),
    }
  }).sort((a, b) => (b.completed + b.abandoned + b.inProgress) - (a.completed + a.abandoned + a.inProgress))

  const totals = byClient.reduce(
    (acc, c) => ({
      completed: acc.completed + c.completed,
      abandoned: acc.abandoned + c.abandoned,
      inProgress: acc.inProgress + c.inProgress,
    }),
    { completed: 0, abandoned: 0, inProgress: 0 },
  )

  // ── Juegos mas descargados (tramos completados, 30 dias)
  const gameIds = topGamesRaw.map((g) => g.gameId)
  const games = await db.game.findMany({
    where: { id: { in: gameIds } },
    select: { id: true, title: true, fileSize: true },
  })
  const gameMap = new Map(games.map((g) => [g.id, g]))
  const topGames = topGamesRaw.map((g) => {
    const game = gameMap.get(g.gameId)
    return {
      gameId: g.gameId,
      title: game?.title ?? 'Desconocido',
      count: g._count._all,
      // Tamano del archivo del juego, no bytes transferidos: DownloadLog guarda
      // el tamano completo en cada tramo, asi que sumarlos inflaria el total.
      fileSize: game?.fileSize?.toString() ?? '0',
    }
  })

  // ── Alertas de descarga y registro de IP
  const ipGeo = await db.ipCache.findMany({
    where: { ip: { in: recentIps.map((r) => r.ip) } },
  })
  const geoMap = new Map(ipGeo.map((g) => [g.ip, g]))
  const ipRegistry = recentIps.map((r) => {
    const geo = geoMap.get(r.ip)
    const ua = parseUaDetail(r.userAgent ?? '')
    return {
      ip: r.ip,
      ts: r.ts.toISOString(),
      country: geo?.country ?? null,
      city: geo?.city ?? null,
      flagEmoji: geo?.flagEmoji ?? null,
      isp: geo?.isp ?? null,
      os: ua.os,
      osVersion: ua.osVersion,
      deviceModel: ua.deviceModel,
      device: r.device,
      browser: r.browser,
    }
  })

  return NextResponse.json({
    proxyTrusted: trustProxy(),
    summary: {
      pageViewsToday,
      uniqueVisitorsToday: uniqueVisitorsToday.length,
    },
    pageViewsByDay: days.map((d, i) => ({ day: d.toISOString(), count: pageViewsByDay[i] })),
    oldestRequestAt: since ? since.toISOString() : null,
    downloads: {
      ...totals,
      successPercent: successPercent(totals.completed, totals.abandoned),
      byClient,
      topGames,
      clientVersions: clientVersionsRaw.map((r) => ({ version: r.clientVersion ?? 'unknown', count: r._count._all })),
    },
    recentSearches,
    ipRegistry,
    rateLimitAlerts,
    recentDiagnostics: recentDiagnostics.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
    retention: RETENTION_DAYS,
  })
}
