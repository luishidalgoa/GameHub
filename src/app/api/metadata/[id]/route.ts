import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getRawgProvider, cleanTitle } from '@/lib/metadata/rawg'
import { downloadAndCacheCover } from '@/lib/covers'
import { fetchSteamGridDBCover } from '@/lib/metadata/steamgriddb'
import { searchYouTubeTrailer } from '@/lib/youtube'
import { serializeBigInt } from '@/lib/serialize'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const gameId = parseInt(params.id, 10)
  const game   = await db.game.findUnique({ where: { id: gameId }, include: { platform: true } })
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const setting  = await db.setting.findUnique({ where: { key: 'rawg_api_key' } })
  const provider = getRawgProvider(setting?.value)
  if (!provider) return NextResponse.json({ error: 'RAWG API key not configured' }, { status: 503 })

  const sp = new URL(req.url).searchParams

  const slugParam = sp.get('slug')
  if (slugParam) {
    const result = await provider.fetchById(slugParam)
    if (!result) return NextResponse.json({ results: [], usedQuery: slugParam, mode: 'slug' })
    return NextResponse.json({ results: [result], usedQuery: slugParam, mode: 'slug' })
  }

  const overrideQuery = sp.get('q') ?? undefined
  const usedQuery     = overrideQuery ?? cleanTitle(game.title)
  const results       = await provider.search(game.title, game.platform.slug, overrideQuery)
  return NextResponse.json({ results, usedQuery, mode: 'search' })
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gameId = parseInt(params.id, 10)
  const body   = await req.json()

  const game = await db.game.findUnique({ where: { id: gameId }, include: { platform: true } })
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const setting  = await db.setting.findUnique({ where: { key: 'rawg_api_key' } })
  const provider = getRawgProvider(setting?.value)
  if (!provider) return NextResponse.json({ error: 'RAWG API key not configured' }, { status: 503 })

  const rawgLookup: number | string = body.rawgSlug ?? body.rawgId
  const meta = await provider.fetchById(rawgLookup)
  if (!meta) return NextResponse.json({ error: 'Not found on RAWG' }, { status: 404 })

  // Try SteamGridDB first for better cover art; fall back to RAWG cover URL
  let coverPath: string | undefined
  const sgdbUrl = await fetchSteamGridDBCover(meta.title)
  const coverSourceUrl = sgdbUrl ?? meta.coverUrl
  if (coverSourceUrl) {
    try { coverPath = await downloadAndCacheCover(coverSourceUrl, game.platform.slug, gameId) } catch { /* non-fatal */ }
  }

  // Auto-search YouTube trailer (only if not already set)
  let trailerUrl: string | undefined
  if (!game.trailerUrl) {
    trailerUrl = await searchYouTubeTrailer(meta.title).catch(() => undefined) ?? undefined
  }

  const updated = await db.game.update({
    where: { id: gameId },
    data: {
      title:             meta.title,
      description:       meta.description,
      releaseYear:       meta.releaseYear,
      genre:             meta.genre,
      developer:         meta.developer,
      publisher:         meta.publisher,
      rawgId:            meta.id,
      rawgSlug:          meta.slug,
      coverUrl:          meta.coverUrl,
      ...(coverPath  && { coverPath }),
      ...(trailerUrl && { trailerUrl }),
      metadataFetchedAt: new Date(),
    },
  })
  return NextResponse.json(serializeBigInt(updated))
}
