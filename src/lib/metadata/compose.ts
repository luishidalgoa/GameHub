import { getRawgProvider, RawgProvider } from './rawg'
import { getLaunchBoxProvider, getLaunchBoxPlatformName, type LaunchBoxGame } from './launchbox'
import { fetchSteamGridDBCover } from './steamgriddb'
import { calcTitleConfidence, calcConfidence, AUTO_THRESHOLD } from './scoring'
import { LAUNCHBOX_PLATFORM_NAMES } from './launchbox'
import type { ProviderMatrix } from './matrix'
import type { MetadataResult } from './provider'

// Composes a single game's metadata from multiple providers according to the
// per-field provider matrix, with graceful fallback when a chosen source is
// empty or returns no confident match.

export interface ComposedMetadata {
  title: string
  description?: string
  releaseYear?: number
  genre?: string
  developer?: string
  publisher?: string
  esrb?: string
  /** Resolved cover image URL (not yet downloaded). */
  coverUrl?: string
  /** Screenshot/extra image URLs. */
  screenshots: string[]
  /** Provenance for each field (for logging / UI). */
  sources: Partial<Record<'cover' | 'info' | 'description' | 'screenshots', 'launchbox' | 'rawg' | 'steamgriddb'>>
  /** Best confidence achieved by the primary info match. */
  confidence: number
  /** IDs for persistence. */
  rawgId?: number
  rawgSlug?: string
}

interface ProviderMatch {
  result: MetadataResult
  confidence: number
}

/** Pick the highest-confidence result from a provider's search list. */
function bestMatch(
  gameTitle: string,
  results: MetadataResult[],
  scorer: (r: MetadataResult) => number,
): ProviderMatch | null {
  if (results.length === 0) return null
  const scored = results
    .map(r => ({ result: r, confidence: scorer(r) }))
    .sort((a, b) => b.confidence - a.confidence)
  return scored[0]
}

export interface GatherInput {
  title: string
  platformSlug: string
  matrix: ProviderMatrix
  rawgApiKey?: string
  /** Minimum confidence for the primary match to be accepted. */
  threshold?: number
  /** Delay (ms) between a provider's search and its detail fetch, to avoid
   *  rate-limiting (LaunchBox throttles bursts). Default 600ms. */
  paceMs?: number
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Fetch & compose metadata for one game. Returns null when no provider produced
 * a confident-enough match for the fields that need a game match.
 */
export async function gatherMetadata(input: GatherInput): Promise<ComposedMetadata | null> {
  const { title, platformSlug, matrix, rawgApiKey, threshold = AUTO_THRESHOLD, paceMs = 600 } = input

  const needsLaunchBox =
    matrix.cover === 'launchbox' || matrix.info === 'launchbox' ||
    matrix.description === 'launchbox' || matrix.screenshots === 'launchbox'
  const needsRawg =
    matrix.cover === 'rawg' || matrix.info === 'rawg' ||
    matrix.description === 'rawg' || matrix.screenshots === 'rawg'

  // ── Resolve LaunchBox match + detail ──
  let lb: LaunchBoxGame | null = null
  let lbConfidence = 0
  if (needsLaunchBox) {
    try {
      const provider = await getLaunchBoxProvider(platformSlug)
      const lbPlatformName = await getLaunchBoxPlatformName(platformSlug)
      const expected = (lbPlatformName ?? LAUNCHBOX_PLATFORM_NAMES[platformSlug] ?? '').toLowerCase()
      const results = await provider.search(title, platformSlug)
      const match = bestMatch(title, results, r =>
        calcTitleConfidence(
          title,
          r.title,
          Boolean(expected) && (r.platformName ?? '').toLowerCase() === expected,
        ),
      )
      if (match && match.confidence >= threshold) {
        lbConfidence = match.confidence
        await sleep(paceMs)   // pace the detail fetch after the search (rate-limit)
        const detail = await provider.fetchById(match.result.id)
        lb = (detail as LaunchBoxGame) ?? null
      }
    } catch { /* LaunchBox failures are non-fatal — fall back to RAWG */ }
  }

  // ── Resolve RAWG match + detail ──
  let rawg: MetadataResult | null = null
  let rawgConfidence = 0
  let rawgProvider: RawgProvider | null = null
  if (needsRawg) {
    try {
      rawgProvider = getRawgProvider(rawgApiKey)
      if (rawgProvider) {
        const results = await rawgProvider.search(title, platformSlug)
        const match = bestMatch(title, results, r => calcConfidence(title, platformSlug, r))
        if (match && match.confidence >= threshold) {
          rawgConfidence = match.confidence
          await sleep(paceMs)   // pace the detail fetch after the search
          rawg = await rawgProvider.fetchById(match.result.id)
        }
      }
    } catch { /* RAWG failure non-fatal */ }
  }

  // If neither primary source matched, give up.
  if (!lb && !rawg) return null

  const sources: ComposedMetadata['sources'] = {}

  // ── INFO (title/dev/publisher/genre/year/esrb) ──
  const infoPrimary = matrix.info === 'launchbox' ? lb : rawg
  const infoFallback = matrix.info === 'launchbox' ? rawg : lb
  const info = infoPrimary ?? infoFallback
  if (info) sources.info = (info === lb ? 'launchbox' : 'rawg')

  // ── DESCRIPTION ──
  let description: string | undefined
  const descPrimary = matrix.description === 'launchbox' ? lb?.description : rawg?.description
  const descFallback = matrix.description === 'launchbox' ? rawg?.description : lb?.description
  description = descPrimary || descFallback
  if (description) sources.description = (description === lb?.description ? 'launchbox' : 'rawg')

  // ── COVER ──
  let coverUrl: string | undefined
  if (matrix.cover === 'launchbox') {
    coverUrl = lb?.coverUrl
    if (coverUrl) sources.cover = 'launchbox'
  } else if (matrix.cover === 'rawg') {
    coverUrl = rawg?.coverUrl
    if (coverUrl) sources.cover = 'rawg'
  } else if (matrix.cover === 'steamgriddb') {
    const sgdb = await fetchSteamGridDBCover(info?.title ?? title)
    if (sgdb) { coverUrl = sgdb; sources.cover = 'steamgriddb' }
  }
  // Fallback chain: prefer LaunchBox box-art, then SteamGridDB, then RAWG art.
  if (!coverUrl) {
    if (lb?.coverUrl) { coverUrl = lb.coverUrl; sources.cover = 'launchbox' }
    else {
      const sgdb = await fetchSteamGridDBCover(info?.title ?? title)
      if (sgdb) { coverUrl = sgdb; sources.cover = 'steamgriddb' }
      else if (rawg?.coverUrl) { coverUrl = rawg.coverUrl; sources.cover = 'rawg' }
    }
  }

  // ── SCREENSHOTS ──
  let screenshots: string[] = []
  if (matrix.screenshots === 'launchbox') {
    screenshots = lb?.screenshots ?? []
    if (screenshots.length) sources.screenshots = 'launchbox'
  } else if (matrix.screenshots === 'rawg') {
    if (rawgProvider && rawg?.slug) {
      try {
        screenshots = await rawgProvider.fetchScreenshots(rawg.slug)
        if (screenshots.length) sources.screenshots = 'rawg'
      } catch { /* non-fatal */ }
    }
  }
  // Fallback if primary screenshot source was empty
  if (screenshots.length === 0) {
    if (lb?.screenshots?.length) { screenshots = lb.screenshots; sources.screenshots = 'launchbox' }
  }

  const title2 = info?.title ?? title

  return {
    title: title2,
    description,
    releaseYear: info?.releaseYear,
    genre: info?.genre,
    developer: info?.developer,
    publisher: info?.publisher,
    esrb: info?.esrb,
    coverUrl,
    screenshots,
    sources,
    confidence: Math.max(lbConfidence, rawgConfidence),
    rawgId: rawg?.id,
    rawgSlug: rawg?.slug,
  }
}
