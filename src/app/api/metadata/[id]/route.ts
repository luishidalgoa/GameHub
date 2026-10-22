import { parseMetadataSources } from '@/lib/metadata/sources'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adminGuard } from '@/lib/admin-guard'
import { getRawgProvider } from '@/lib/metadata/rawg'
import { fileToTitle } from '@/lib/utils'
import { getLaunchBoxProvider, fetchLaunchBoxGame } from '@/lib/metadata/launchbox'
import { getProviderMatrix } from '@/lib/metadata/matrix'
import { gatherMetadata } from '@/lib/metadata/compose'
import { downloadAndCacheCover } from '@/lib/covers'
import { fetchSteamGridDBCover } from '@/lib/metadata/steamgriddb'
import { searchYouTubeTrailer } from '@/lib/youtube'
import { serializeBigInt } from '@/lib/serialize'
import type { MetadataResult } from '@/lib/metadata/provider'
import { chooseCover } from '@/lib/metadata/compose'
import { fetchLibretroCover } from '@/lib/metadata/libretro'
import type { LaunchBoxGame } from '@/lib/metadata/launchbox'
import { changedFields, lockFields, LOCKABLE_FIELDS } from '@/lib/manual-fields'
import { applyMetadata } from '@/lib/metadata/apply'
import { scoreForGame } from '@/lib/metadata/one-score'
import { parseRomTags, languagesToCsv } from '@/lib/rom-tags'
import { extractSwitchTitleId } from '@/lib/scanner/titleid'

export const dynamic = 'force-dynamic'

type Source = 'launchbox' | 'rawg'

async function rawgKey(): Promise<string | undefined> {
  const s = await db.setting.findUnique({ where: { key: 'rawg_api_key' } })
  return s?.value || process.env.RAWG_API_KEY || undefined
}

/** Which provider runs the manual search box — follows the matrix's `info`
 *  setting for THIS game's platform, falling back to whichever provider is
 *  actually usable. The slug matters: a platform can override the global
 *  choice, and searching with the wrong provider is how a Switch game ends up
 *  wearing someone else's box art. */
async function manualSearchSource(platformSlug: string): Promise<Source> {
  const matrix = await getProviderMatrix(platformSlug)
  if (matrix.info === 'launchbox') return 'launchbox'
  if (matrix.info === 'rawg' && (await rawgKey())) return 'rawg'
  return (await rawgKey()) ? 'rawg' : 'launchbox'
}

// ── GET: manual search (fallback) — candidates from the info provider ─────────
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const denied = await adminGuard()
  if (denied) return denied

  const gameId = parseInt(params.id, 10)
  const game = await db.game.findUnique({ where: { id: gameId }, include: { platform: true } })
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sp = new URL(req.url).searchParams
  const overrideQuery = sp.get('q') ?? undefined
  const usedQuery = overrideQuery ?? fileToTitle(game.title)

  // The admin can force which provider serves the manual search — the default,
  // matrix-driven one may not list a given game. Falls back to the matrix choice
  // when no valid override is given.
  const overrideProvider = sp.get('provider')
  const source: Source =
    overrideProvider === 'launchbox' || overrideProvider === 'rawg'
      ? overrideProvider
      : await manualSearchSource(game.platform.slug)

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
  // Resolved for this game's platform: a per-platform override only takes
  // effect if the slug reaches here.
  const matrix = await getProviderMatrix(game.platform.slug)
  const meta = await gatherMetadata({
    title:        game.title,
    platformSlug: game.platform.slug,
    fileName:     game.fileName,
    launchboxId:  game.launchboxId,
    rawgId:       game.rawgId,
    matrix,
    rawgApiKey:   await rawgKey(),
  })
  if (!meta) return NextResponse.json({ error: 'No confident match found' }, { status: 404 })

  // A cover the admin chose by hand is never replaced by an automatic run (#81).
  const prevSources = parseMetadataSources(game.metadataSources)
  const coverLocked = prevSources.coverManual === true

  let coverPath: string | undefined
  if (meta.coverUrl && !coverLocked) {
    try { coverPath = await downloadAndCacheCover(meta.coverUrl, game.platform.slug, gameId) } catch { /* non-fatal */ }
  }
  let trailerUrl: string | undefined
  if (!game.trailerUrl) trailerUrl = (await searchYouTubeTrailer(meta.title).catch(() => undefined)) ?? undefined

  // Tags the file name carries (region, languages, Nintendo title id) fill the
  // ghost fields when they are empty; the owner's values are never overwritten.
  const tags = parseRomTags(game.fileName)
  const fromName = {
    ...(!game.titleId && extractSwitchTitleId(game.fileName) && { titleId: extractSwitchTitleId(game.fileName) }),
    ...(!game.region && tags.region && { region: tags.region }),
    ...(!game.languages && tags.languages?.length && { languages: languagesToCsv(tags.languages) }),
  }

  // The score the scores batch would write, when the game has none yet (#80 scale).
  const scoreFill = game.rawgScore == null
    ? await scoreForGame({ title: game.title, platformSlug: game.platform.slug, rawgId: game.rawgId }, await rawgKey(), 350)
    : null

  const updated = await applyMetadata(gameId, { origin: 'auto', sources: {
    ...meta.sources,
    ...(meta.facts && Object.keys(meta.facts).length > 0 ? { facts: meta.facts } : {}),
    ...(coverLocked ? { cover: prevSources.cover, coverManual: true } : {}),
  }, data: {
      ...fromName,
      ...(scoreFill && {
        rawgScore:      scoreFill.rawgScore,
        scoreSource:    scoreFill.scoreSource,
        rawgMetacritic: scoreFill.rawgMetacritic,
        rawgRating:     scoreFill.rawgRating,
        rawgAdded:      scoreFill.rawgAdded,
      }),
      title:       meta.title,
      description: meta.description,
      releaseYear: meta.releaseYear,
      genre:       meta.genre,
      developer:   meta.developer,
      publisher:   meta.publisher,
      ...(!coverLocked && { coverUrl: meta.coverUrl }),
      ...(meta.screenshots.length > 0 && { screenshotPaths: JSON.stringify(meta.screenshots) }),
      ...(meta.rawgId   != null && { rawgId: meta.rawgId }),
      ...(meta.rawgSlug && { rawgSlug: meta.rawgSlug }),
      ...(meta.launchboxId != null && { launchboxId: meta.launchboxId }),
      ...(coverPath  && { coverPath }),
      ...(trailerUrl && { trailerUrl }),
      // Same rule as the batch: a cover-only result is not "metadata fetched".
      ...(meta.sources.info ? { metadataFetchedAt: new Date() } : {}),
    },
  })
  return NextResponse.json({ ...serializeBigInt(updated), sources: { ...meta.sources, facts: meta.facts } })
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

  // The picked candidate's own art first; without it, the platform's cover chain.
  const row = await db.game.findUnique({ where: { id: gameId }, select: { fileName: true } })
  // Only LaunchBox's own box art is taken as the picked candidate's cover; a RAWG
  // image is a screenshot (see chooseCover).
  const cover = source === 'launchbox' && meta.coverUrl
    ? { coverUrl: meta.coverUrl, source }
    : await chooseCover({
        matrix:       await getProviderMatrix(platformSlug),
        lb:           source === 'launchbox' ? (meta as LaunchBoxGame) : null,
        rawg:         source === 'rawg' ? meta : null,
        sgdbTitle:    meta.title,
        libretroBox:  () => fetchLibretroCover(row?.fileName ?? meta.title, platformSlug),
        sgdbCover:    fetchSteamGridDBCover,
      })
  const coverUrl = cover?.coverUrl
  const coverSource = cover?.source
  let coverPath: string | undefined
  if (coverUrl) {
    try { coverPath = await downloadAndCacheCover(coverUrl, platformSlug, gameId) } catch { /* non-fatal */ }
  }

  let trailerUrl: string | undefined
  if (!existingTrailer) trailerUrl = (await searchYouTubeTrailer(meta.title).catch(() => undefined)) ?? undefined

  const prevRow = await db.game.findUnique({ where: { id: gameId }, select: { metadataSources: true } })
  const facts: Record<string, typeof source> = {}
  if (meta.developer)   facts.developer = source
  if (meta.publisher)   facts.publisher = source
  if (meta.releaseYear) facts.releaseYear = source
  if (meta.genre)       facts.genre = source
  const sources = {
    info:        source,
    ...(Object.keys(facts).length ? { facts } : {}),
    description: meta.description ? source : undefined,
    cover:       coverUrl ? coverSource : undefined,
    screenshots: screenshots.length ? source : undefined,
    // A pick that brings a cover is a manual choice; one without a cover keeps the old flag.
    ...(coverUrl ? { coverManual: true } : { coverManual: parseMetadataSources(prevRow?.metadataSources).coverManual }),
  }

  const updated = await applyMetadata(gameId, { origin: 'pick', sources, data: {
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
      ...(source === 'launchbox' && { launchboxId: Number(id) }),
      ...(coverPath  && { coverPath }),
      ...(trailerUrl && { trailerUrl }),
      metadataFetchedAt: new Date(),
  } })
  return { ...updated, sources }
}
