import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { ArtError, listGameArt } from '@/lib/game-art'
import { purgeExpiredManualArt } from '@/lib/art-manual'

export const dynamic = 'force-dynamic'

// GET — what the editor's image section shows: the active images and the library by category.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const denied = await adminGuard()
  if (denied) return denied
  try {
    await purgeExpiredManualArt()
    return NextResponse.json(await listGameArt(parseInt(params.id, 10)))
  } catch (e) {
    if (e instanceof ArtError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
