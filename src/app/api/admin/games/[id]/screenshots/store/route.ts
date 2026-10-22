import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { ArtError, storeExternalScreenshots } from '@/lib/game-art'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// POST — copies the screenshots that live on another server (LaunchBox) into the bucket.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const denied = await adminGuard()
  if (denied) return denied
  try {
    return NextResponse.json(await storeExternalScreenshots(parseInt(params.id, 10)))
  } catch (e) {
    if (e instanceof ArtError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
