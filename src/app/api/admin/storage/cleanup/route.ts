import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { cleanupStorage } from '@/lib/storage-cleanup'

export const dynamic = 'force-dynamic'
export const maxDuration = 600

// POST { dryRun?: boolean } — clears libretro snapshot pointers and deletes the
// bucket's orphans. dryRun (the default) only reports what would go.
export async function POST(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const body = await req.json().catch(() => ({})) as { dryRun?: boolean }
  const report = await cleanupStorage({ dryRun: body.dryRun !== false })
  return NextResponse.json(report)
}
