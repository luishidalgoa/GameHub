import { createHash } from 'crypto'
import sharp from 'sharp'
import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { db } from '@/lib/db'
import { uploadToS3, deleteManyFromS3 } from '@/lib/s3'
import { paletteOf } from '@/lib/palette'
import { lockFields, parseLocks } from '@/lib/manual-fields'

export const dynamic = 'force-dynamic'

const MAX_UPLOAD = 15 * 1024 * 1024
const KINDS = ['fanart', 'banner', 'logo'] as const
type ManualKind = (typeof KINDS)[number]

// POST multipart { kind: fanart|banner|logo, file } — art the owner supplies by hand.
// Stored in the repository like the LaunchBox images (kind "manual-<kind>" as its source),
// and pointed at by the game's art fields so the home and the grids use it.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const denied = await adminGuard()
  if (denied) return denied

  const id = parseInt(params.id, 10)
  const form = await req.formData().catch(() => null)
  const kind = form?.get('kind') as ManualKind | null
  const file = form?.get('file')
  if (!kind || !KINDS.includes(kind) || !(file instanceof File)) {
    return NextResponse.json({ error: 'kind (fanart|banner|logo) and file are required' }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD) return NextResponse.json({ error: 'file too large' }, { status: 413 })

  const game = await db.game.findUnique({ where: { id }, select: { id: true, platform: { select: { slug: true } } } })
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  const source = Buffer.from(await file.arrayBuffer())
  const webp = await sharp(source)
    .resize({ width: kind === 'logo' ? 1000 : 1920, withoutEnlargement: true })
    .webp({ quality: kind === 'logo' ? 90 : 84, alphaQuality: 95 })
    .toBuffer()
    .catch(() => null)
  if (!webp) return NextResponse.json({ error: 'not a valid image' }, { status: 400 })

  const meta = await sharp(webp).metadata()
  const hash = createHash('sha1').update(`${kind}:${file.name}:${webp.length}:${Date.now()}`).digest('hex').slice(0, 8)
  const s3Key = `repo/${game.platform.slug}/${game.id}/manual-${kind}-${hash}.webp`
  await uploadToS3(webp, s3Key)
  await db.gameImage.create({
    data: {
      gameId: game.id, kind: `manual-${kind}`, width: meta.width ?? null, height: meta.height ?? null,
      s3Key, sourceUrl: `manual:${hash}`,
    },
  })

  const path = `${s3Key}?v=${Date.now()}`
  const data: Record<string, unknown> = {}
  if (kind === 'fanart') {
    data.tilePath = path
    data.backdropPath = path
    data.backdropKind = 'fanart'
  } else if (kind === 'banner') {
    data.backdropPath = path
    data.backdropKind = 'banner'
    data.tilePath = path
  } else {
    data.logoPath = path
  }
  if (kind !== 'logo') data.themePalette = JSON.stringify(await paletteOf(webp))
  data.manualFields = lockFields(
    (await db.game.findUnique({ where: { id: game.id }, select: { manualFields: true } }))?.manualFields,
    Object.keys(data),
  )
  await db.game.update({ where: { id: game.id }, data })

  return NextResponse.json({ ok: true, key: s3Key })
}

// DELETE ?imageId=… — takes a manual image back: its stored row, the game fields that
// point at it (and their locks), and the object in the bucket. Only what points at
// this image is cleared; an image the art job set is never touched here.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const denied = await adminGuard()
  if (denied) return denied

  const gameId = parseInt(params.id, 10)
  const imageId = parseInt(new URL(req.url).searchParams.get('imageId') ?? '', 10)
  const image = await db.gameImage.findFirst({ where: { id: imageId, gameId } })
  if (!image || !image.kind.startsWith('manual-')) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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

  await db.gameImage.delete({ where: { id: image.id } })
  await deleteManyFromS3([image.s3Key]).catch(() => 0)
  return NextResponse.json({ ok: true, released })
}
