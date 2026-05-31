import { NextResponse } from 'next/server'
import { startScanJob } from '@/lib/jobs/runner'

export const dynamic = 'force-dynamic'

// Start a background scan job. Progress streams over the scan SSE bus as before;
// the Job row lets the dashboard show "a scan is running" when you return.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const platformSlug = typeof body.platformSlug === 'string' && body.platformSlug ? body.platformSlug : undefined
  const id = await startScanJob({ platformSlug })
  return NextResponse.json({ ok: true, jobId: id })
}
