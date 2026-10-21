import { adminGuard } from '@/lib/admin-guard'
import { NextResponse } from 'next/server'
import { cleanOrphanCovers } from '@/lib/platforms/maintenance'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// POST: delete cover objects in MinIO that no longer belong to any game.
export async function POST() {
  const denied = await adminGuard()
  if (denied) return denied

  try {
    const result = await cleanOrphanCovers()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cleanup failed' },
      { status: 500 },
    )
  }
}
