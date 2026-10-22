import { createHash } from 'crypto'
import sharp from 'sharp'
import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { db } from '@/lib/db'
import { uploadToS3 } from '@/lib/s3'
import { paletteOf } from '@/lib/palette'

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
  await db.game.update({ where: { id: game.id }, data })

  return NextResponse.json({ ok: true, key: s3Key })
}
