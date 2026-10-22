import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET ?after=<lineId>&limit=200 — the persistent log of one job, oldest first.
// Pass the last id you have to read only what is new; that is how a page follows a
// running job, and how it reads the whole history again after a reload.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const denied = await adminGuard()
  if (denied) return denied

  const jobId = parseInt(params.id, 10)
  const url = new URL(req.url)
  const after = Math.max(0, parseInt(url.searchParams.get('after') ?? '0', 10) || 0)
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') ?? '200', 10) || 200))

  const lines = await db.jobLog.findMany({
    where: { jobId, id: { gt: after } },
    orderBy: { id: 'asc' },
    take: limit,
    select: { id: true, at: true, text: true },
  })
  return NextResponse.json({
    lines: lines.map(l => ({ id: l.id, at: l.at.toISOString(), text: l.text })),
    last: lines.length ? lines[lines.length - 1].id : after,
  })
}
