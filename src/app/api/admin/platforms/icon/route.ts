import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { db } from '@/lib/db'
import { uploadToS3, deleteFromS3, resolveCoverPath, coverPathToKey } from '@/lib/s3'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const iconKey = (slug: string) => `icons/${slug}.webp`

// POST multipart { platformId, file } → process to a square webp, store in MinIO,
// set Platform.iconPath. Accepts PNG/SVG/JPG; always rasterized to webp (uniform
// content-type, no raw-SVG XSS surface).
export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const platformId = parseInt(form.get('platformId') as string, 10)
    const file = form.get('file') as File | null
    if (!platformId || !file) {
      return NextResponse.json({ error: 'platformId and file are required' }, { status: 400 })
    }

    const platform = await db.platform.findUnique({ where: { id: platformId }, select: { slug: true } })
    if (!platform) return NextResponse.json({ error: 'Platform not found' }, { status: 404 })

    const input = Buffer.from(await file.arrayBuffer())
    const processed = await sharp(input)
      .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90 })
      .toBuffer()

    const key = iconKey(platform.slug)
    await uploadToS3(processed, key, 'image/webp')

    // Cache-bust: the key stays stable, resolveCoverPath forwards the ?v=.
    const iconPath = `${key}?v=${Date.now()}`
    await db.platform.update({ where: { id: platformId }, data: { iconPath } })

    return NextResponse.json({ iconPath, resolved: resolveCoverPath(iconPath) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE { platformId } → remove the uploaded icon, revert to the emoji fallback.
export async function DELETE(req: Request) {
  try {
    const { platformId } = await req.json().catch(() => ({}))
    if (!platformId) return NextResponse.json({ error: 'platformId required' }, { status: 400 })

    const platform = await db.platform.findUnique({ where: { id: platformId }, select: { slug: true, iconPath: true } })
    if (!platform) return NextResponse.json({ error: 'Platform not found' }, { status: 404 })

    const key = coverPathToKey(platform.iconPath) ?? iconKey(platform.slug)
    await deleteFromS3(key)
    await db.platform.update({ where: { id: platformId }, data: { iconPath: null } })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
