import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { db } from '@/lib/db'
import { parseLocks } from '@/lib/manual-fields'
import { REMOVAL_WINDOW_MS } from '@/lib/art-manual'
import { ArtError, storeManualImage, useAsSlot } from '@/lib/game-art'
import { fetchRemoteImage } from '@/lib/remote-image'

export const dynamic = 'force-dynamic'

const MAX_UPLOAD = 15 * 1024 * 1024
const KINDS = ['fanart', 'banner', 'logo'] as const
type ManualKind = (typeof KINDS)[number]

// POST multipart { kind: fanart|banner|logo, file | url } — art the owner supplies by hand, as a file
// or as a link. Stored in the repository like the LaunchBox images (kind "manual-<kind>" as its source),
// and pointed at by the game's art fields so the home and the grids use it.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const denied = await adminGuard()
  if (denied) return denied

  const id = parseInt(params.id, 10)
  const form = await req.formData().catch(() => null)
  const kind = form?.get('kind') as ManualKind | null
  const file = form?.get('file')
  const link = form?.get('url')
  if (!kind || !KINDS.includes(kind) || !(file instanceof File || (typeof link === 'string' && link.trim()))) {
    return NextResponse.json({ error: 'kind (fanart|banner|logo) and a file or url are required' }, { status: 400 })
  }
  if (file instanceof File && file.size > MAX_UPLOAD) return NextResponse.json({ error: 'file too large' }, { status: 413 })

  const game = await db.game.findUnique({ where: { id }, select: { id: true, platform: { select: { slug: true } } } })
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  try {
    const source = file instanceof File ? Buffer.from(await file.arrayBuffer()) : await fetchRemoteImage(link as string)
    const { image, palette } = await storeManualImage({ id: game.id, platformSlug: game.platform.slug }, kind, source)
    await useAsSlot(game.id, kind, image.s3Key, palette)
    return NextResponse.json({ ok: true, key: image.s3Key })
  } catch (e) {
    if (e instanceof ArtError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo guardar la imagen' }, { status: 400 })
  }
}

// DELETE ?imageId=… — takes a manual image off the game. The fields that pointed at it
// and their locks are cleared now; the image itself stays in the bucket for the removal
// window, so POST …/restore can put it back. After the window it is deleted (art-manual.ts).
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const denied = await adminGuard()
  if (denied) return denied

  const gameId = parseInt(params.id, 10)
  const imageId = parseInt(new URL(req.url).searchParams.get('imageId') ?? '', 10)
  const image = await db.gameImage.findFirst({ where: { id: imageId, gameId, removedAt: null } })
  if (!image) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const game = await db.game.findUnique({
    where: { id: gameId },
    select: { backdropPath: true, logoPath: true, tilePath: true, manualFields: true },
  })
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  const pointsHere = (path: string | null) => !!path && path.split('?')[0] === image.s3Key
  const data: Record<string, unknown> = {}
  const released: string[] = []
  if (pointsHere(game.backdropPath)) {
    data.backdropPath = null; data.backdropKind = null; data.themePalette = null
    released.push('backdropPath', 'backdropKind', 'themePalette')
  }
  if (pointsHere(game.tilePath)) { data.tilePath = null; released.push('tilePath') }
  if (pointsHere(game.logoPath)) { data.logoPath = null; released.push('logoPath') }
  if (released.length) {
    const kept = parseLocks(game.manualFields).filter(f => !released.includes(f))
    data.manualFields = kept.length ? JSON.stringify(kept) : null
    await db.game.update({ where: { id: gameId }, data })
  }

  await db.gameImage.update({ where: { id: image.id }, data: { removedAt: new Date() } })
  return NextResponse.json({ ok: true, released, restorableMs: REMOVAL_WINDOW_MS })
}
