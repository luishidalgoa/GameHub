import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { db } from '@/lib/db'
import { fetchGameArt } from '@/lib/art'
import { runAutomatic } from '@/lib/automatic'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// POST — "Buscar arte": reads LaunchBox's images for this one game and stores them, with the banner,
// fanart and logo picked as the art job does. Only images: the metadata is not touched.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const denied = await adminGuard()
  if (denied) return denied

  const id = parseInt(params.id, 10)
  const game = await db.game.findUnique({
    where: { id },
    select: { id: true, title: true, fileName: true, launchboxId: true, platform: { select: { slug: true } } },
  })
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  const outcome = await runAutomatic(() => fetchGameArt({
    id: game.id,
    title: game.title,
    fileName: game.fileName,
    launchboxId: game.launchboxId,
    platformSlug: game.platform.slug,
  }, 400))
  return NextResponse.json({ outcome })
}
