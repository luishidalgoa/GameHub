import { adminGuard } from '@/lib/admin-guard'
import { NextResponse } from 'next/server'
import { startMetadataJob, type MetadataJobParams } from '@/lib/jobs/runner'
import { isBatchMode, isFieldScope } from '@/lib/metadata/scope'

export const dynamic = 'force-dynamic'

// Start a background metadata job. Returns immediately with the job id; progress
// is polled via GET /api/admin/jobs/active?type=metadata.
export async function POST(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied

  const body = await req.json().catch(() => ({})) as Partial<Omit<MetadataJobParams, 'fields'>> & { fields?: unknown }
  if (body.fields !== undefined && !Array.isArray(body.fields)) {
    return NextResponse.json({ error: 'fields must be a list of categories' }, { status: 400 })
  }
  const params: MetadataJobParams = {
    mode: isBatchMode(body.mode) ? body.mode : 'missing',
    popularityRedo: body.popularityRedo === true,
    platformSlug: typeof body.platformSlug === 'string' && body.platformSlug ? body.platformSlug : undefined,
    withCovers: body.withCovers !== false,
    withTrailers: body.withTrailers !== false,
    withScores: body.withScores !== false,
    // An explicit list (even an empty one) is the admin's choice; no list means every category.
    fields: Array.isArray(body.fields) ? body.fields.filter(isFieldScope) : undefined,
    respectPinned: body.respectPinned !== false,
  }
  const id = await startMetadataJob(params)
  return NextResponse.json({ ok: true, jobId: id })
}
