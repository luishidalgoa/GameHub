import { adminGuard } from '@/lib/admin-guard'
import { NextResponse } from 'next/server'
import { cancelJob, type JobType } from '@/lib/jobs/runner'

export const dynamic = 'force-dynamic'

// POST { type: 'metadata' | 'scan' | 'art' } → request cancellation of the running job.
export async function POST(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const type = body.type
  if (type !== 'metadata' && type !== 'scan' && type !== 'art') {
    return NextResponse.json({ error: 'type must be metadata, scan or art' }, { status: 400 })
  }
  const cancelled = await cancelJob(type as JobType)
  return NextResponse.json({ ok: true, cancelled })
}
