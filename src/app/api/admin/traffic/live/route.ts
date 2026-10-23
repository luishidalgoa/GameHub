import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getRateLimitAlerts, parseUaDetail } from '@/lib/tracker'
import { adminGuard } from '@/lib/admin-guard'
import { errorPercent } from '@/lib/traffic-stats'

export const dynamic = 'force-dynamic'

const ACTIVE_WINDOW_MS = 5 * 60 * 1000
const ERRORS_WINDOW_MS = 60 * 60 * 1000

/** Lightweight endpoint: only the data that changes second to second. */
export async function GET() {
  const denied = await adminGuard()
  if (denied) return denied

  const now = Date.now()
  const activeSince = new Date(now - ACTIVE_WINDOW_MS)
  const errorsSince = new Date(now - ERRORS_WINDOW_MS)

  const [activeNow, requests1h, errors1h, recentRequests, recentSearches, rateLimitAlerts] = await Promise.all([
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
  })
}
