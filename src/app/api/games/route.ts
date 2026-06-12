import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { serializeBigInt } from '@/lib/serialize'
import { getClientIp } from '@/lib/tracker'
import { resolveCoverPath } from '@/lib/s3'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const platformSlug = searchParams.get('platform')
  const search = searchParams.get('search') ?? ''
  const sort = searchParams.get('sort') ?? 'title'
  const favorites = searchParams.get('favorites') === 'true'
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const pageSize = parseInt(searchParams.get('pageSize') ?? '100', 10)

  const region = searchParams.get('region') ?? ''
  const genre = searchParams.get('genre') ?? ''
  const minRatingRaw = searchParams.get('minRating')
  const noScore = minRatingRaw === 'none'
  const minRating = minRatingRaw && !noScore ? Number(minRatingRaw) : null

  const where = {
    isHidden: false,
    ...(platformSlug && { platform: { slug: platformSlug } }),
    ...(search    && { title: { contains: search } }),
    ...(favorites && { isFavorite: true }),
    // Match the primary region OR any region-variant edition, so a card whose
    // primary is e.g. EUR still shows when filtering by a JPN variant it holds.
    ...(region    && { OR: [{ region }, { dlcs: { some: { type: 'region', region } } }] }),
    ...(genre     && { genre }),
    // "none" → only games without a score; otherwise a min on the unified 0–100.
    ...(noScore && { rawgScore: null }),
    ...(minRating != null && !Number.isNaN(minRating) && { rawgScore: { gte: minRating } }),
  }

  const orderBy =
    sort === 'year' ? { releaseYear: 'asc' as const }
    : sort === 'added' ? { createdAt: 'desc' as const }
    : sort === 'size' ? { fileSize: 'desc' as const }
    // Popularity ≈ rawgAdded DESC (the score is dominated by log(added); uses the
    // [platformId, rawgAdded] index). NULLs sort last in SQLite DESC.
    : sort === 'popularity' ? { rawgAdded: 'desc' as const }
    // Top-rated by the unified 0–100 score.
    : sort === 'rating' ? { rawgScore: 'desc' as const }
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
        rawgRating: true,
        rawgMetacritic: true,
        rawgAdded: true,
        rawgScore: true,
      },
    }),
    db.game.count({ where }),
  ])

  const resolvedGames = games.map(g => ({ ...g, coverPath: resolveCoverPath(g.coverPath) }))

  return NextResponse.json(serializeBigInt({ games: resolvedGames, total, page, pageSize }))
}
