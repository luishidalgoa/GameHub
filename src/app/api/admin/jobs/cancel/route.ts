import { NextResponse } from 'next/server'
import { cancelJob, type JobType } from '@/lib/jobs/runner'

export const dynamic = 'force-dynamic'

// POST { type: 'metadata' | 'scan' } → request cancellation of the running job.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const type = body.type
  if (type !== 'metadata' && type !== 'scan') {
    return NextResponse.json({ error: 'type must be metadata or scan' }, { status: 400 })
  }
  const cancelled = await cancelJob(type as JobType)
  return NextResponse.json({ ok: true, cancelled })
}
