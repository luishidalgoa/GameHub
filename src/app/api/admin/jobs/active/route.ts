import { NextResponse } from 'next/server'
import { getLatestJob, type JobType } from '@/lib/jobs/runner'

export const dynamic = 'force-dynamic'

// GET ?type=metadata|scan → the latest job of that type (running or finished),
// used by the dashboard to show progress on return. Returns { job: null } when
// there has never been one.
export async function GET(req: Request) {
  const type = new URL(req.url).searchParams.get('type')
  if (type !== 'metadata' && type !== 'scan') {
    return NextResponse.json({ error: 'type must be metadata or scan' }, { status: 400 })
  }
  const job = await getLatestJob(type as JobType)
  if (!job) return NextResponse.json({ job: null })
  return NextResponse.json({
    job: {
      id:        job.id,
      type:      job.type,
      status:    job.status,
      phase:     job.phase,
      total:     job.total,
      processed: job.processed,
      applied:   job.applied,
      skipped:   job.skipped,
      failed:    job.failed,
      lastTitle: job.lastTitle,
      message:   job.message,
      startedAt:  job.startedAt,
      finishedAt: job.finishedAt,
    },
  })
}
