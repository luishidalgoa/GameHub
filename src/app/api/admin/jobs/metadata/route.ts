import { NextResponse } from 'next/server'
import { startMetadataJob, type MetadataJobParams } from '@/lib/jobs/runner'

export const dynamic = 'force-dynamic'

// Start a background metadata job. Returns immediately with the job id; progress
// is polled via GET /api/admin/jobs/active?type=metadata.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as Partial<MetadataJobParams>
  const mode = body.mode
  const params: MetadataJobParams = {
    mode: mode === 'fill' || mode === 'redo' || mode === 'wrong-provider' ? mode : 'missing',
    platformSlug: typeof body.platformSlug === 'string' && body.platformSlug ? body.platformSlug : undefined,
    withCovers: body.withCovers !== false,
    withTrailers: body.withTrailers !== false,
  }
  const id = await startMetadataJob(params)
  return NextResponse.json({ ok: true, jobId: id })
}
