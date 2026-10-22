import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { db } from '@/lib/db'
import { lockFields } from '@/lib/manual-fields'
import { fieldsFor, isInWindow, purgeExpiredManualArt, type ManualKind } from '@/lib/art-manual'

export const dynamic = 'force-dynamic'

// POST ?imageId=… — puts back a manual image removed a moment ago. Only while its window
// is open, and only into fields that are still empty: nothing is overwritten.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const denied = await adminGuard()
  if (denied) return denied

  const gameId = parseInt(params.id, 10)
  const imageId = parseInt(new URL(req.url).searchParams.get('imageId') ?? '', 10)
  await purgeExpiredManualArt()

  const image = await db.gameImage.findFirst({ where: { id: imageId, gameId } })
  if (!image || !image.removedAt || !image.kind.startsWith('manual-')) {
    return NextResponse.json({ error: 'Ya no se puede deshacer' }, { status: 410 })
  }
  if (!isInWindow(image.removedAt)) {
    return NextResponse.json({ error: 'Ya no se puede deshacer' }, { status: 410 })
  }

  const kind = image.kind.replace('manual-', '') as ManualKind
  const game = await db.game.findUnique({
    where: { id: gameId },
    select: { backdropPath: true, logoPath: true, manualFields: true },
  })
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  const slot = kind === 'logo' ? game.logoPath : game.backdropPath
  if (slot) return NextResponse.json({ error: 'El juego ya tiene otra imagen en ese sitio' }, { status: 409 })

  const path = `${image.s3Key}?v=${Date.now()}`
  const data: Record<string, unknown> = { ...fieldsFor(kind, path) }
  if (image.palette) data.themePalette = image.palette
  const released = Object.keys(data)
  data.manualFields = lockFields(game.manualFields, released)
  await db.game.update({ where: { id: gameId }, data })
  await db.gameImage.update({ where: { id: image.id }, data: { removedAt: null } })
  return NextResponse.json({ ok: true })
}
