import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { serializeBigInt } from '@/lib/serialize'
import { getRateLimitAlerts, parseUaDetail } from '@/lib/tracker'

export const dynamic = 'force-dynamic'

export async function GET() {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000)
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

  // Build last-7-days sparkline buckets
  const sparklineDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayStart)
    d.setDate(d.getDate() - (6 - i))
    return d
  })

  const [
    totalPageViews,
    uniqueVisitorsToday,
    pageViewsToday,
    pageViewsWeek,
    activeNow,
    recentRequests,
    deviceBreakdown,
    browserBreakdown,
    recentSearches,
    topPlatforms,
    topPages,
    recentIps,
    downloadSummary,
    topDownloadedRaw,
    downloadsByDeviceRaw,
    rateLimitAlerts,
    avgLatency,
    errorCounts,
    sparklineRaw,
    downloadSparklineRaw,
  ] = await Promise.all([
    // Total all-time page views
    db.requestLog.count(),

    // Unique IPs today
    db.requestLog.findMany({
      where: { ts: { gte: todayStart } },
      select: { ip: true },
      distinct: ['ip'],
    }),

    // Page views today
    db.requestLog.count({ where: { ts: { gte: todayStart } } }),

    // Page views this week
    db.requestLog.count({ where: { ts: { gte: weekAgo } } }),

    // Active now (last 10 min)
    db.requestLog.findMany({
      where: { ts: { gte: tenMinAgo } },
      select: { ip: true },
      distinct: ['ip'],
    }),

    // Recent 100 requests for display
    db.requestLog.findMany({
      orderBy: { ts: 'desc' },
      take: 100,
      select: { id: true, ip: true, path: true, status: true, device: true, browser: true, durationMs: true, ts: true, bytes: true },
    }),

    // Device breakdown (last 30 days)
    db.requestLog.groupBy({
      by: ['device'],
      _count: { id: true },
      where: { ts: { gte: monthAgo } },
    }),

    // Browser breakdown (last 30 days)
    db.requestLog.groupBy({
      by: ['browser'],
      _count: { id: true },
      where: { ts: { gte: monthAgo } },
      orderBy: { _count: { id: 'desc' } },
      take: 8,
    }),

    // Recent searches (still fetched for initial render fallback)
    db.searchLog.findMany({
      orderBy: { ts: 'desc' },
      take: 30,
      select: { id: true, query: true, ip: true, results: true, ts: true },
    }),

    // Top platforms visited (/platform/[slug])
    db.requestLog.findMany({
      where: { path: { startsWith: '/platform/' }, ts: { gte: monthAgo } },
      select: { path: true },
    }),

    // Top pages
    db.requestLog.groupBy({
      by: ['path'],
      _count: { id: true },
      where: { ts: { gte: weekAgo } },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    }),

    // Recent unique IPs with geo cache
    db.requestLog.findMany({
      where: { ts: { gte: weekAgo } },
      select: { ip: true, userAgent: true, device: true, browser: true, ts: true },
      orderBy: { ts: 'desc' },
      distinct: ['ip'],
      take: 30,
    }),

    // Download summary
    db.downloadLog.aggregate({
      _count: { id: true },
      _sum: { fileSize: true },
      where: { completed: true },
    }),

    // Top downloaded games (all time)
    db.downloadLog.groupBy({
      by: ['gameId'],
      _count: { id: true },
      _sum: { fileSize: true },
      orderBy: { _count: { id: 'desc' } },
      take: 15,
    }),

    // Downloads by device (raw rows, we'll group in JS)
    db.downloadLog.findMany({
      select: { gameId: true, device: true },
      where: { device: { not: null } },
    }),

    // Rate limit alerts
    getRateLimitAlerts(),

    // Average latency (last hour)
    db.requestLog.aggregate({
      _avg: { durationMs: true },
      where: { ts: { gte: oneHourAgo }, durationMs: { not: null } },
    }),

    // HTTP error breakdown
    db.requestLog.groupBy({
      by: ['status'],
      _count: { id: true },
      where: { ts: { gte: weekAgo }, status: { gte: 400 } },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    }),

    // Sparkline: page views per day for last 7 days
    db.requestLog.findMany({
      where: { ts: { gte: sparklineDays[0] } },
      select: { ts: true },
    }),

    // Sparkline: downloads per day for last 7 days
    db.downloadLog.findMany({
      where: { startedAt: { gte: sparklineDays[0] } },
      select: { startedAt: true },
    }),
  ])

  // Build sparklines
  const pvByDay = sparklineDays.map((day) => {
    const nextDay = new Date(day.getTime() + 86400000)
    return sparklineRaw.filter((r) => r.ts >= day && r.ts < nextDay).length
  })

  const dlByDay = sparklineDays.map((day) => {
    const nextDay = new Date(day.getTime() + 86400000)
    return downloadSparklineRaw.filter((r) => r.startedAt >= day && r.startedAt < nextDay).length
  })

  // Top platforms from URL breakdown
  const platformCounts: Record<string, number> = {}
  for (const r of topPlatforms) {
    const slug = r.path.split('/')[2]
    if (slug) platformCounts[slug] = (platformCounts[slug] ?? 0) + 1
  }
  const topPlatformsSorted = Object.entries(platformCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([slug, count]) => ({ slug, count }))

  // ── Top downloaded games with titles ──────────────────────────────────────
  const dlGameIds = [...new Set(topDownloadedRaw.map((g) => g.gameId))]
  const dlGames = await db.game.findMany({
    where: { id: { in: dlGameIds } },
    select: { id: true, title: true },
  })
  const dlGameMap = Object.fromEntries(dlGames.map((g) => [g.id, g.title]))

  const topDownloads = topDownloadedRaw.map((g) => ({
    gameId: g.gameId,
    title: dlGameMap[g.gameId] ?? 'Unknown',
    count: g._count.id,
    bytes: g._sum.fileSize ?? BigInt(0),
  }))

  // ── Downloads by device per game (top 8 games) ────────────────────────────
  const top8ids = topDownloadedRaw.slice(0, 8).map((g) => g.gameId)
  const DEVICES = ['desktop', 'mobile', 'tablet', 'console', 'unknown']

  const deviceGameMatrix: Record<number, Record<string, number>> = {}
  for (const row of downloadsByDeviceRaw) {
    if (!top8ids.includes(row.gameId)) continue
    if (!deviceGameMatrix[row.gameId]) deviceGameMatrix[row.gameId] = {}
    const dev = row.device ?? 'unknown'
    deviceGameMatrix[row.gameId][dev] = (deviceGameMatrix[row.gameId][dev] ?? 0) + 1
  }

  const downloadsByDevice = top8ids.map((id) => {
    const title = dlGameMap[id] ?? 'Unknown'
    const shortTitle = title.length > 20 ? title.slice(0, 18) + '…' : title
    const counts = deviceGameMatrix[id] ?? {}
    return { title: shortTitle, ...Object.fromEntries(DEVICES.map((d) => [d, counts[d] ?? 0])) }
  })

  // Fetch geo for recent IPs
  const ipGeo = await db.ipCache.findMany({
    where: { ip: { in: recentIps.map((r) => r.ip) } },
  })
  const geoMap = Object.fromEntries(ipGeo.map((g) => [g.ip, g]))

  const recentIpsWithGeo = recentIps.map((r) => {
    const geo    = geoMap[r.ip]
    const uaDet  = parseUaDetail(r.userAgent ?? '')
    return {
      ...r,
      country:     geo?.country     ?? null,
      city:        geo?.city        ?? null,
      flagEmoji:   geo?.flagEmoji   ?? null,
      isp:         geo?.isp         ?? null,
      os:          uaDet.os,
      osVersion:   uaDet.osVersion,
      deviceModel: uaDet.deviceModel,
    }
  })

  // Bounce rate: sessions (IPs today) with only 1 page view
  const sessionCounts = await db.requestLog.groupBy({
    by: ['ip'],
    _count: { id: true },
    where: { ts: { gte: todayStart } },
  })
  const bounced = sessionCounts.filter((s) => s._count.id === 1).length
  const bounceRate = sessionCounts.length > 0
    ? Math.round((bounced / sessionCounts.length) * 100)
    : 0

  return NextResponse.json(
    serializeBigInt({
      summary: {
        totalPageViews,
        uniqueVisitorsToday: uniqueVisitorsToday.length,
        pageViewsToday,
        pageViewsWeek,
        activeNow: activeNow.length,
        bounceRate,
        avgLatencyMs: Math.round(avgLatency._avg.durationMs ?? 0),
        totalDownloads: downloadSummary._count.id,
        totalBytesTransferred: downloadSummary._sum.fileSize ?? BigInt(0),
      },
      sparklines: { pageViews: pvByDay, downloads: dlByDay },
      deviceBreakdown,
      browserBreakdown,
      recentSearches,
      topPlatforms: topPlatformsSorted,
      topPages,
      topDownloads,
      downloadsByDevice,
      recentIps: recentIpsWithGeo,
      rateLimitAlerts,
      errorCounts,
      recentRequests: recentRequests.slice(0, 50),
    })
  )
}
