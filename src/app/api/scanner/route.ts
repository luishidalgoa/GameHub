import { NextResponse } from 'next/server'
import { startScanJob } from '@/lib/jobs/runner'

// POST — starts a scan as a job: its progress lines are kept in the job log, and a
// scan already running is returned as it is instead of starting a second one.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const platformSlug: string | undefined = body.platformSlug || undefined
  const jobId = await startScanJob({ platformSlug })
  return NextResponse.json({ ok: true, jobId, message: 'Scan started' })
}
