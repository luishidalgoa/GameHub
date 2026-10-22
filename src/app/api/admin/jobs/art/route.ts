import { adminGuard } from '@/lib/admin-guard'
import { NextResponse } from 'next/server'
import { startArtJob, type ArtJobParams } from '@/lib/jobs/runner'

export const dynamic = 'force-dynamic'

// Start the background art job (LaunchBox backdrops, logos and palettes).
// Progress is polled via GET /api/admin/jobs/active?type=art.
export async function POST(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied

  const body = await req.json().catch(() => ({})) as Partial<ArtJobParams>
  const params: ArtJobParams = {
    platformSlug: typeof body.platformSlug === 'string' && body.platformSlug ? body.platformSlug : undefined,
    redo: body.redo === true,
    checkedBefore: typeof body.checkedBefore === 'string' && !Number.isNaN(Date.parse(body.checkedBefore)) ? body.checkedBefore : undefined,
  }
  const id = await startArtJob(params)
  return NextResponse.json({ ok: true, jobId: id })
}
