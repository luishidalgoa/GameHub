import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getRateLimitAlerts, parseUaDetail } from '@/lib/tracker'

export const dynamic = 'force-dynamic'

/** Lightweight endpoint — only the data that changes second-to-second. */
export async function GET() {
  const now = new Date()
  const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000)

  const [activeNow, recentRequests, recentSearches, rateLimitAlerts] = await Promise.all([
    db.requestLog.findMany({
      where: { ts: { gte: tenMinAgo } },
      select: { ip: true },
      distinct: ['ip'],
    }),

    db.requestLog.findMany({
      orderBy: { ts: 'desc' },
      take: 50,
      select: { id: true, ip: true, path: true, status: true, device: true, browser: true, durationMs: true, ts: true, bytes: true, userAgent: true },
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
    return { ...r, os: d.os, osVersion: d.osVersion, deviceModel: d.deviceModel }
  })

  return NextResponse.json({
    activeNow: activeNow.length,
    recentRequests: enrichedRequests,
    recentSearches,
    rateLimitAlerts,
  })
}
