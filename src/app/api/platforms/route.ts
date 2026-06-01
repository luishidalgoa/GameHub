import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { deletePlatformDeep, renamePlatformSlug } from '@/lib/platforms/maintenance'

export const dynamic = 'force-dynamic'

export async function GET() {
  const platforms = await db.platform.findMany({
    where: { enabled: true },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { games: { where: { isHidden: false } } } } },
  })
  return NextResponse.json(platforms)
}

export async function POST(req: Request) {
  const body = await req.json()
  const { slug, name, scanPath, extensions, scanMode, thumbnailWidth, thumbnailHeight, sortOrder, scanDlc } = body
  if (!slug || !name || !scanPath || !extensions) {
    return NextResponse.json({ error: 'slug, name, scanPath and extensions are required' }, { status: 400 })
  }
  const platform = await db.platform.create({
    data: {
      slug:            slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      name,
      scanPath,
      extensions,
      scanMode:        scanMode ?? 'flat',
      thumbnailWidth:  thumbnailWidth ?? 200,
      thumbnailHeight: thumbnailHeight ?? 300,
      sortOrder:       sortOrder ?? 99,
      scanDlc:         scanDlc ?? false,
    },
  })
  return NextResponse.json(platform, { status: 201 })
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const { id, slug, ...data } = body

  // Renaming the slug is NOT a plain field update: cover object keys in MinIO and
  // the launchbox_platform_map are keyed by slug, so it needs migration. Route it
  // through renamePlatformSlug instead of a blind update.
  if (slug !== undefined) {
    try {
      const result = await renamePlatformSlug(id, String(slug))
      // Apply any other fields changed in the same request.
      if (Object.keys(data).length) await db.platform.update({ where: { id }, data })
      const platform = await db.platform.findUnique({ where: { id } })
      return NextResponse.json({ ...platform, _rename: result })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Rename failed' }, { status: 409 })
    }
  }

  const platform = await db.platform.update({ where: { id }, data })
  return NextResponse.json(platform)
}

export async function DELETE(req: Request) {
  const { id } = await req.json()
  try {
    const result = await deletePlatformDeep(id)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Delete failed' }, { status: 500 })
  }
}
