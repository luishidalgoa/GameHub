import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
  const { slug, name, scanPath, extensions, scanMode, sortOrder } = body
  if (!slug || !name || !scanPath || !extensions) {
    return NextResponse.json({ error: 'slug, name, scanPath and extensions are required' }, { status: 400 })
  }
  const platform = await db.platform.create({
    data: {
      slug:       slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      name,
      scanPath,
      extensions,
      scanMode:   scanMode ?? 'flat',
      sortOrder:  sortOrder ?? 99,
    },
  })
  return NextResponse.json(platform, { status: 201 })
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const { id, ...data } = body
  const platform = await db.platform.update({ where: { id }, data })
  return NextResponse.json(platform)
}

export async function DELETE(req: Request) {
  const { id } = await req.json()
  await db.platform.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
