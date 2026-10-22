import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { ArtError, activateImage } from '@/lib/game-art'

export const dynamic = 'force-dynamic'

// POST { imageId } — takes an image of the library into its place (cover, banner, fanart or logo).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const denied = await adminGuard()
  if (denied) return denied
  const imageId = Number((await req.json().catch(() => ({})))?.imageId)
  if (!Number.isInteger(imageId)) return NextResponse.json({ error: 'imageId is required' }, { status: 400 })
  try {
    const result = await activateImage(parseInt(params.id, 10), imageId)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    if (e instanceof ArtError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
