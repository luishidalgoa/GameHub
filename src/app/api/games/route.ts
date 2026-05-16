import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { serializeBigInt } from '@/lib/serialize'
import { getClientIp } from '@/lib/tracker'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const platformSlug = searchParams.get('platform')
  const search = searchParams.get('search') ?? ''
  const sort = searchParams.get('sort') ?? 'title'
  const favorites = searchParams.get('favorites') === 'true'
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const pageSize = parseInt(searchParams.get('pageSize') ?? '100', 10)

  const where = {
    isHidden: false,
    ...(platformSlug && { platform: { slug: platformSlug } }),
    ...(search && { title: { contains: search } }),
    ...(favorites && { isFavorite: true }),
  }

  const orderBy =
    sort === 'year' ? { releaseYear: 'asc' as const }
    : sort === 'added' ? { createdAt: 'desc' as const }
    : sort === 'size' ? { fileSize: 'desc' as const }
    : { sortTitle: 'asc' as const }

  // Log searches asynchronously (don't block response)
  if (search && search.length > 1) {
    const ip = getClientIp(req)
    db.searchLog.create({ data: { query: search, ip, results: 0 } })
      .catch(() => {})
  }

  const [games, total] = await Promise.all([
    db.game.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        sortTitle: true,
        region: true,
        releaseYear: true,
        genre: true,
        coverPath: true,
        coverUrl: true,
        isFavorite: true,
        isHidden: true,
        platformId: true,
        fileSize: true,
        metadataFetchedAt: true,
        fileName: true,
      },
    }),
    db.game.count({ where }),
  ])

  return NextResponse.json(serializeBigInt({ games, total, page, pageSize }))
}
