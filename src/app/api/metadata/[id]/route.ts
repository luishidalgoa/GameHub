import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getRawgProvider, cleanTitle } from '@/lib/metadata/rawg'
import { getLaunchBoxProvider, fetchLaunchBoxGame } from '@/lib/metadata/launchbox'
import { getProviderMatrix } from '@/lib/metadata/matrix'
import { gatherMetadata } from '@/lib/metadata/compose'
import { downloadAndCacheCover } from '@/lib/covers'
import { fetchSteamGridDBCover } from '@/lib/metadata/steamgriddb'
import { searchYouTubeTrailer } from '@/lib/youtube'
import { serializeBigInt } from '@/lib/serialize'
import type { MetadataResult } from '@/lib/metadata/provider'

export const dynamic = 'force-dynamic'

type Source = 'launchbox' | 'rawg'

async function rawgKey(): Promise<string | undefined> {
  const s = await db.setting.findUnique({ where: { key: 'rawg_api_key' } })
  return s?.value || process.env.RAWG_API_KEY || undefined
}

/** Which provider runs the manual search box — follows the matrix's `info`
 *  setting, falling back to whichever provider is actually usable. */
async function manualSearchSource(): Promise<Source> {
  const matrix = await getProviderMatrix()
  if (matrix.info === 'launchbox') return 'launchbox'
  if (matrix.info === 'rawg' && (await rawgKey())) return 'rawg'
  return (await rawgKey()) ? 'rawg' : 'launchbox'
}

// ── GET: manual search (fallback) — candidates from the info provider ─────────
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const gameId = parseInt(params.id, 10)
  const game = await db.game.findUnique({ where: { id: gameId }, include: { platform: true } })
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sp = new URL(req.url).searchParams
  const overrideQuery = sp.get('q') ?? undefined
  const usedQuery = overrideQuery ?? cleanTitle(game.title)

  const source = await manualSearchSource()

  let results: Array<MetadataResult & { source: Source }> = []
  if (source === 'launchbox') {
    const provider = await getLaunchBoxProvider(game.platform.slug)
    const r = await provider.search(game.title, game.platform.slug, overrideQuery)
    results = r.map(x => ({ ...x, source: 'launchbox' as const }))
  } else {
    const provider = getRawgProvider(await rawgKey())
    if (!provider) return NextResponse.json({ error: 'RAWG API key not configured' }, { status: 503 })
    const r = await provider.search(game.title, game.platform.slug, overrideQuery)
    results = r.map(x => ({ ...x, source: 'rawg' as const }))
  }

  return NextResponse.json({ provider: source, results, usedQuery })
}

// ── POST: apply metadata ──────────────────────────────────────────────────────
//   {}                        → one-click auto-fill following the provider matrix
//   { source, id }            → apply a specific candidate the admin picked
//   { rawgId } / { rawgSlug } → legacy: a RAWG manual pick
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gameId = parseInt(params.id, 10)
  const body = await req.json().catch(() => ({}))

  const game = await db.game.findUnique({ where: { id: gameId }, include: { platform: true } })
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Normalize a manual pick (new + legacy shapes).
  const pickSource: Source | null =
    body.source === 'launchbox' || body.source === 'rawg' ? body.source
      : (body.rawgId != null || body.rawgSlug != null) ? 'rawg'
        : null
  const pickId: number | string | undefined = body.id ?? body.rawgSlug ?? body.rawgId

  // ── Manual pick: apply exactly the chosen candidate ──
  if (pickSource && pickId != null) {
    const applied = await applyManualPick(game.platform.slug, gameId, pickSource, pickId, game.trailerUrl)
    if (!applied) return NextResponse.json({ error: 'Could not fetch that game' }, { status: 404 })
    return NextResponse.json(serializeBigInt(applied))
  }

  // ── One-click auto-fill following the matrix ──
  const matrix = await getProviderMatrix()
  const meta = await gatherMetadata({
    title:        game.title,
    platformSlug: game.platform.slug,
    matrix,
    rawgApiKey:   await rawgKey(),
  })
  if (!meta) return NextResponse.json({ error: 'No confident match found' }, { status: 404 })

  let coverPath: string | undefined
  if (meta.coverUrl) {
    try { coverPath = await downloadAndCacheCover(meta.coverUrl, game.platform.slug, gameId) } catch { /* non-fatal */ }
  }
  let trailerUrl: string | undefined
  if (!game.trailerUrl) trailerUrl = (await searchYouTubeTrailer(meta.title).catch(() => undefined)) ?? undefined

  const updated = await db.game.update({
    where: { id: gameId },
    data: {
      title:       meta.title,
      description: meta.description,
      releaseYear: meta.releaseYear,
      genre:       meta.genre,
      developer:   meta.developer,
      publisher:   meta.publisher,
      coverUrl:    meta.coverUrl,
      ...(meta.screenshots.length > 0 && { screenshotPaths: JSON.stringify(meta.screenshots) }),
      ...(meta.rawgId   != null && { rawgId: meta.rawgId }),
      ...(meta.rawgSlug && { rawgSlug: meta.rawgSlug }),
      ...(coverPath  && { coverPath }),
      ...(trailerUrl && { trailerUrl }),
      metadataSources: JSON.stringify(meta.sources),
      metadataFetchedAt: new Date(),
    },
  })
  return NextResponse.json({ ...serializeBigInt(updated), sources: meta.sources })
}

/** Apply a single chosen candidate wholesale (all its fields from its source). */
async function applyManualPick(
  platformSlug: string,
  gameId: number,
  source: Source,
  id: number | string,
  existingTrailer: string | null,
) {
  let meta: MetadataResult | null = null
  let screenshots: string[] = []

  if (source === 'launchbox') {
    const lb = await fetchLaunchBoxGame(Number(id))
    if (lb) { meta = lb; screenshots = lb.screenshots ?? [] }
  } else {
    const provider = getRawgProvider(await rawgKey())
    if (provider) {
      meta = await provider.fetchById(id)
      if (meta?.slug) { try { screenshots = await provider.fetchScreenshots(meta.slug) } catch { /* ignore */ } }
    }
  }
  if (!meta) return null

  // Cover: prefer the picked source's art; if it has none, fall back to SteamGridDB.
  let coverUrl = meta.coverUrl
  let coverSource: 'launchbox' | 'rawg' | 'steamgriddb' = source
  if (!coverUrl) {
    const sgdb = await fetchSteamGridDBCover(meta.title)
    if (sgdb) { coverUrl = sgdb; coverSource = 'steamgriddb' }
  }
  let coverPath: string | undefined
  if (coverUrl) {
    try { coverPath = await downloadAndCacheCover(coverUrl, platformSlug, gameId) } catch { /* non-fatal */ }
  }

  let trailerUrl: string | undefined
  if (!existingTrailer) trailerUrl = (await searchYouTubeTrailer(meta.title).catch(() => undefined)) ?? undefined

  const sources = {
    info:        source,
    description: meta.description ? source : undefined,
    cover:       coverUrl ? coverSource : undefined,
    screenshots: screenshots.length ? source : undefined,
  }

  const updated = await db.game.update({
    where: { id: gameId },
    data: {
      title:       meta.title,
      description: meta.description,
      releaseYear: meta.releaseYear,
      genre:       meta.genre,
      developer:   meta.developer,
      publisher:   meta.publisher,
      coverUrl,
      ...(screenshots.length > 0 && { screenshotPaths: JSON.stringify(screenshots) }),
      ...(source === 'rawg' && typeof meta.id === 'number' && { rawgId: meta.id }),
      ...(source === 'rawg' && meta.slug && { rawgSlug: meta.slug }),
      ...(coverPath  && { coverPath }),
      ...(trailerUrl && { trailerUrl }),
      metadataSources: JSON.stringify(sources),
      metadataFetchedAt: new Date(),
    },
  })
  return { ...updated, sources }
}
