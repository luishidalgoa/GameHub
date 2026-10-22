import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET ?limit=30 — the most recent scans, newest first (#139).
export async function GET(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied

  const limit = Math.min(100, Math.max(1, parseInt(new URL(req.url).searchParams.get('limit') ?? '30', 10) || 30))
  const logs = await db.scanLog.findMany({
    orderBy: { startedAt: 'desc' },
    take: limit,
    select: { id: true, startedAt: true, finishedAt: true, gamesFound: true, gamesAdded: true, gamesUpdated: true, gamesStale: true, triggeredBy: true, jobId: true },
  })
  return NextResponse.json(logs.map(l => ({
    ...l,
    startedAt: l.startedAt.toISOString(),
    finishedAt: l.finishedAt?.toISOString() ?? null,
  })))
}
