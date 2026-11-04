import { parseMetadataSources } from '@/lib/metadata/sources'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adminGuard } from '@/lib/admin-guard'
import { getRawgProvider, RawgAuthError } from '@/lib/metadata/rawg'
import { fileToTitle } from '@/lib/utils'
import { getLaunchBoxProvider, fetchLaunchBoxGame } from '@/lib/metadata/launchbox'
import { getProviderMatrix } from '@/lib/metadata/matrix'
import { gatherMetadata, StoreUnavailableError } from '@/lib/metadata/compose'
import { downloadAndCacheCover, saveCoverFromBuffer } from '@/lib/covers'
import { fetchSteamGridDBCover } from '@/lib/metadata/steamgriddb'
import { searchYouTubeTrailer } from '@/lib/youtube'
import { serializeBigInt } from '@/lib/serialize'
import type { MetadataResult } from '@/lib/metadata/provider'
import { fetchLibretroCover, libretroSystemFor } from '@/lib/metadata/libretro'
import type { LaunchBoxGame } from '@/lib/metadata/launchbox'
import { changedFields, lockFields, LOCKABLE_FIELDS } from '@/lib/manual-fields'
import { applyMetadata, textPatch, type TextField } from '@/lib/metadata/apply'
import { storeLaunchBoxArt } from '@/lib/art'
import type { FieldSource } from '@/lib/metadata/sources'
import { scoreForGame } from '@/lib/metadata/one-score'
import { consoleSlugFor } from '@/lib/metadata/platform-console'
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
    let applied
    try {
      applied = await applyManualPick(game.platform.slug, gameId, pickSource, pickId, game.trailerUrl)
    } catch (err) {
      if (err instanceof RawgAuthError) {
        return NextResponse.json({ error: err.quota ? 'rawg_quota' : 'rawg_key_rejected', message: err.message }, { status: 503 })
      }
      throw err
    }
    if (!applied) return NextResponse.json({ error: 'Could not fetch that game' }, { status: 404 })
    return NextResponse.json(serializeBigInt(applied))
  }

  // ── One-click auto-fill following the matrix ──
  // Resolved for this game's platform: a per-platform override only takes
  // effect if the slug reaches here.
  const matrix = await getProviderMatrix(game.platform.slug)
  let meta
  try {
    meta = await gatherMetadata({
      title:        game.title,
      platformSlug: game.platform.slug,
      fileName:     game.fileName,
      retroSystem:  libretroSystemFor(game.platform.slug, game),
      launchboxId:  game.launchboxId,
      rawgId:       game.rawgId,
      matrix,
      coverBox:     { width: game.platform.thumbnailWidth, height: game.platform.thumbnailHeight, altWidth: game.platform.altThumbnailWidth, altHeight: game.platform.altThumbnailHeight },
      rawgApiKey:   await rawgKey(),
    })
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return NextResponse.json({ error: 'store_unavailable', message: err.message }, { status: 503 })
    }
    if (err instanceof RawgAuthError) {
      return NextResponse.json({ error: err.quota ? 'rawg_quota' : 'rawg_key_rejected', message: err.message }, { status: 503 })
    }
    throw err
  }
  if (!meta) return NextResponse.json({ error: 'No confident match found' }, { status: 404 })

  // A cover the admin chose by hand is never replaced by an automatic run (#81).
  const prevSources = parseMetadataSources(game.metadataSources)
  const coverLocked = prevSources.coverManual === true

  let coverPath: string | undefined
  if (meta.coverUrl && !coverLocked) {
    try {
      coverPath = meta.coverBuffer
        ? await saveCoverFromBuffer(meta.coverBuffer, game.platform.slug, gameId)
        : await downloadAndCacheCover(meta.coverUrl, game.platform.slug, gameId)
    } catch { /* non-fatal */ }
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
    ? await scoreForGame({ title: game.title, platformSlug: game.platform.slug, consoleSlug: consoleSlugFor(game.platform.slug, game), rawgId: game.rawgId }, await rawgKey(), 350)
    : null

  // Each text field carries the provider that gave it: the info source, or the
  // per-fact source Wikidata-style facts record (#133).
  const facts = meta.facts as Partial<Record<TextField, FieldSource>> | undefined
  const patch = textPatch({
    title: meta.title, description: meta.description, releaseYear: meta.releaseYear,
    genre: meta.genre, developer: meta.developer, publisher: meta.publisher,
  }, f => f === 'description' ? meta.sources.description : (facts?.[f] ?? meta.sources.info))
  // The art of the same LaunchBox page: every image is stored, and the banner, fanart and logo follow.
  if (meta.images.length > 0) {
    await storeLaunchBoxArt(
      { id: gameId, platformSlug: game.platform.slug, fileName: game.fileName },
      meta.images,
      { found: true, launchboxId: meta.launchboxId, paceMs: 250 },
    ).catch(() => 'no-art' as const)
  }
  const updated = await applyMetadata(gameId, { origin: 'auto', patch, sources: {
    cover:       coverLocked ? prevSources.cover : meta.sources.cover,
    screenshots: meta.sources.screenshots,
    ...(coverLocked ? { coverManual: true } : {}),
  }, data: {
      ...fromName,
      ...(scoreFill && {
        rawgScore:      scoreFill.rawgScore,
        scoreSource:    scoreFill.scoreSource,
        rawgMetacritic: scoreFill.rawgMetacritic,
        rawgRating:     scoreFill.rawgRating,
        rawgAdded:      scoreFill.rawgAdded,
      }),
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
  const row = await db.game.findUnique({ where: { id: gameId }, select: { fileName: true, filePath: true, externalKey: true } })
  // Only LaunchBox's own box art is taken as the picked candidate's cover; a RAWG
  // image is a screenshot (see cover-choice.ts).
  // The LaunchBox box the admin picked is its own cover. Otherwise the platform's cover chain
  // decides, judged against the platform's box size.
  const boxSize = await db.platform.findUnique({ where: { slug: platformSlug }, select: { thumbnailWidth: true, thumbnailHeight: true, altThumbnailWidth: true, altThumbnailHeight: true } })
  const cover = source === 'launchbox' && meta.coverUrl
    ? { coverUrl: meta.coverUrl, source, buffer: undefined }
    : await gatherMetadata({
        title:        meta.title,
        platformSlug,
        fileName:     row?.fileName ?? undefined,
        retroSystem:  libretroSystemFor(platformSlug, row ?? {}),
        matrix:       await getProviderMatrix(platformSlug),
        coverBox:     boxSize ? { width: boxSize.thumbnailWidth, height: boxSize.thumbnailHeight, altWidth: boxSize.altThumbnailWidth, altHeight: boxSize.altThumbnailHeight } : undefined,
      })
        .then(g => (g?.coverUrl && g.sources.cover ? { coverUrl: g.coverUrl, source: g.sources.cover, buffer: g.coverBuffer } : null))
        .catch(() => null)
  const coverUrl = cover?.coverUrl
  const coverSource = cover?.source
  let coverPath: string | undefined
  if (coverUrl) {
    try {
      coverPath = cover?.buffer
        ? await saveCoverFromBuffer(cover.buffer, platformSlug, gameId)
        : await downloadAndCacheCover(coverUrl, platformSlug, gameId)
    } catch { /* non-fatal */ }
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

  // The candidate's text, each field labelled with the provider it came from.
  const patch = textPatch({
    title: meta.title, description: meta.description, releaseYear: meta.releaseYear,
    genre: meta.genre, developer: meta.developer, publisher: meta.publisher,
  }, () => source)
  // A picked LaunchBox game brings its whole art: every image, and the banner, fanart and logo.
  const pickedImages = source === 'launchbox' ? ((meta as LaunchBoxGame).images ?? []) : []
  if (pickedImages.length > 0) {
    await storeLaunchBoxArt(
      { id: gameId, platformSlug, fileName: row?.fileName ?? undefined },
      pickedImages,
      { found: true, launchboxId: Number(id), paceMs: 250 },
    ).catch(() => 'no-art' as const)
  }
  const updated = await applyMetadata(gameId, { origin: 'pick', patch, sources: {
    cover:       coverUrl ? coverSource : undefined,
    screenshots: screenshots.length ? source : undefined,
    coverManual: coverUrl ? true : parseMetadataSources(prevRow?.metadataSources).coverManual,
  }, data: {
      coverUrl,
      ...(screenshots.length > 0 && { screenshotPaths: JSON.stringify(screenshots) }),
      ...(source === 'rawg' && typeof meta.id === 'number' && { rawgId: meta.id }),
      ...(source === 'rawg' && meta.slug && { rawgSlug: meta.slug }),
      ...(source === 'launchbox' && { launchboxId: Number(id) }),
      ...(coverPath  && { coverPath }),
      ...(trailerUrl && { trailerUrl }),
      metadataFetchedAt: new Date(),
      // A pick is a ficha: the game leaves no_match/provider_error for good, as the batch does.
      metadataStatus: 'matched',
      metadataAttempts: 0,
      metadataNextRetryAt: null,
      metadataReason: null,
  } })
  return { ...updated, sources }
}
