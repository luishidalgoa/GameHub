import { getRawgProvider, RawgAuthError, RawgProvider } from './rawg'
import { getLaunchBoxProvider, getLaunchBoxPlatformName, type LaunchBoxGame } from './launchbox'
import { searchStore, fetchStoreProduct } from './nintendo-store'
import { fetchSteamGridDBCover } from './steamgriddb'
import { fetchLibretroCover } from './libretro'
import { calcTitleConfidence, calcConfidence, AUTO_THRESHOLD } from './scoring'
import { LAUNCHBOX_PLATFORM_NAMES } from './launchbox'
import type { ProviderMatrix } from './matrix'
import type { CoverSource } from './chains'
import { chooseCover, type PlatformCoverBox } from './cover-choice'
import type { LaunchBoxImage } from './launchbox'
import type { MetadataResult } from './provider'
import { isLaunchBoxUnmapped, type MatchDiagnostics } from './no-match'

// Composes a single game's metadata from multiple providers according to the
// per-field provider matrix, with graceful fallback when a chosen source is
// empty or returns no confident match.

export interface ComposedMetadata {
  title: string
  description?: string
  releaseYear?: number
  releaseDate?: Date
  genre?: string
  developer?: string
  publisher?: string
  esrb?: string
  /** Resolved cover image URL. */
  coverUrl?: string
  /** The cover's bytes, read while the chain chose it: stored from these, not downloaded again. */
  coverBuffer?: Buffer
  /** The size of the chosen cover, in pixels, when its image was read. */
  coverWidth?: number
  coverHeight?: number
  /** LaunchBox id of the matched game, kept so later lookups skip the title search. */
  launchboxId?: number
  /** Screenshot/extra image URLs. */
  screenshots: string[]
  /** Every image LaunchBox publishes for the game, at its original size: stored by the art flow. */
  images: LaunchBoxImage[]
  /** Provenance for each field (for logging / UI). */
  sources: Partial<Record<'cover' | 'info' | 'description' | 'screenshots', 'launchbox' | 'rawg' | 'steamgriddb' | 'libretro' | 'nintendo'>>
  /** Which provider gave each fact field, so the editor labels it (#133). */
  facts?: Partial<Record<'developer' | 'publisher' | 'releaseYear' | 'genre', 'launchbox' | 'rawg' | 'nintendo'>>
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

/**
 * The Nintendo store could not be read (index or product page failed). Thrown
 * instead of answering "no match" so the batch retries the game soon, rather
 * than parking it as no_match for two weeks.
 */
export class StoreUnavailableError extends Error {
  constructor(message = 'Una fuente de metadatos no responde') {
    super(message)
    this.name = 'StoreUnavailableError'
  }
}

export interface GatherInput {
  title: string
  platformSlug: string
  /** ROM file name, e.g. "Ninja Cop (Europe).gba". Only the libretro cover
   *  source uses it: it matches on No-Intro names, where the region tag decides
   *  which of a game's boxes is the right one. Optional — without it that
   *  source simply finds nothing and the chain falls through. */
  fileName?: string
  /** libretro system the game is served from (see libretroSystemFor). Game Boy
   *  games pick gb, gbc or gba here; undefined means the platform's own slug,
   *  null means no system can be told, so the libretro source is skipped. */
  retroSystem?: string | null
  /** LaunchBox id saved from an earlier pick: fetched directly, no title search. */
  launchboxId?: number | null
  /** RAWG id saved from an earlier match: fetched directly, no title search. */
  rawgId?: number | null
  matrix: ProviderMatrix
  /** The platform's box size, in pixels: a cover is judged against it (cover-choice.ts). */
  coverBox?: PlatformCoverBox
  /** False when the pass will not write the cover: the cover chain is not asked at all. Default true. */
  coverWanted?: boolean
  rawgApiKey?: string
  /** True once RAWG refused this run (key or monthly quota): it is not asked again. */
  rawgOff?: boolean
  /** Minimum confidence for the primary match to be accepted. */
  threshold?: number
  /** False: a game no provider matched gets no cover, the libretro box is not kept alone.
   *  Default true (the single-game fetch keeps it). The batch turns it off: without a ficha
   *  there is no game behind that box. */
  coverWithoutMatch?: boolean
  /** Delay (ms) between a provider's search and its detail fetch, to avoid
   *  rate-limiting (LaunchBox throttles bursts). Default 600ms. */
  paceMs?: number
  /** Filled in while the sources are asked, so a caller can tell why nothing matched
   *  when this returns null. Ignored when a match is found. */
  diagnostics?: MatchDiagnostics
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** The message of a provider failure, for the batch log. */
const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/**
 * Fetch & compose metadata for one game. Returns null when no provider produced
 * a confident-enough match for the fields that need a game match.
 */
export async function gatherMetadata(input: GatherInput): Promise<ComposedMetadata | null> {
  const { title, platformSlug, fileName, launchboxId, rawgId, matrix, rawgApiKey, threshold = AUTO_THRESHOLD, paceMs = 600, diagnostics: diag } = input
  const retroSystem = input.retroSystem === undefined ? platformSlug : input.retroSystem

  // Every source a chain asks for: a provider is only fetched when some chain needs it.
  const chains = matrix.chains
  const asked = (source: string) =>
    chains.cover.includes(source as CoverSource) || chains.info.includes(source as never) ||
    chains.description.includes(source as never) || chains.screenshots.includes(source as never)
  const needsLaunchBox = asked('launchbox')
  // A RAWG id saved on the game is fetched even when the matrix does not use RAWG
  // as primary: it is the fallback for info, and without it a game LaunchBox does
  // not match would have no source at all.
  const needsRawg = (asked('rawg') || Boolean(rawgId)) && !input.rawgOff

  // ── Resolve LaunchBox match + detail ──
  let lb: LaunchBoxGame | null = null
  let lbConfidence = 0
  // LaunchBox no respondió (red, tiempo de espera): no es «sin coincidencia».
  let lbDown = false
  let lbError = ''
  if (needsLaunchBox) {
    try {
      const provider = await getLaunchBoxProvider(platformSlug)
      if (launchboxId) {
        lb = (await provider.fetchById(launchboxId)) as LaunchBoxGame | null
        lbConfidence = lb ? 100 : 0
      } else {
        const lbPlatformName = await getLaunchBoxPlatformName(platformSlug)
        const expected = (lbPlatformName ?? LAUNCHBOX_PLATFORM_NAMES[platformSlug] ?? '').toLowerCase()
        const results = await provider.search(title, platformSlug)
        if (diag) {
          diag.launchboxUnmapped = isLaunchBoxUnmapped(platformSlug, lbPlatformName)
          diag.launchboxCandidates = results.length
        }
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
      }
    } catch (err) { lbDown = true; lbError = errorText(err) /* LaunchBox failures are non-fatal here; if nothing else matches, the game is retried later */ }
  }

  // ── Resolve RAWG match + detail ──
  let rawg: MetadataResult | null = null
  let rawgConfidence = 0
  let rawgProvider: RawgProvider | null = null
  // RAWG no respondió: igual que LaunchBox, no es «sin coincidencia».
  let rawgDown = false
  let rawgError = ''
  // RAWG refused the key: kept apart from an outage, see the check after the sources.
  let rawgAuth: RawgAuthError | null = null
  if (needsRawg) {
    try {
      rawgProvider = getRawgProvider(rawgApiKey)
      if (rawgProvider && rawgId) {
        // Already matched once: the saved id is the same game, no search needed.
        rawg = await rawgProvider.fetchById(rawgId)
        rawgConfidence = rawg ? 100 : 0
      } else if (rawgProvider) {
        const results = await rawgProvider.search(title, platformSlug)
        if (diag) diag.rawgCandidates = results.length
        const match = bestMatch(title, results, r => calcConfidence(title, platformSlug, r))
        if (match && match.confidence >= threshold) {
          rawgConfidence = match.confidence
          await sleep(paceMs)   // pace the detail fetch after the search
          rawg = await rawgProvider.fetchById(match.result.id)
        }
      }
    } catch (err) {
      // A rejected key is not an outage: it stops the run below, it is not a game to retry.
      if (err instanceof RawgAuthError) {
        rawgAuth = err
        if (diag) diag.rawgRefused = true
      }
      else { rawgDown = true; rawgError = errorText(err) /* RAWG failure non-fatal here; if nothing else matches, the game is retried later */ }
    }
  }

  // Switch: la tienda oficial de Nintendo va antes que RAWG para la ficha y la portada.
  let nin: MetadataResult | null = null
  let storeDown = false
  if (platformSlug === 'switch') {
    try {
      const hit = await searchStore(title)
      if (diag) diag.storeHit = Boolean(hit)
      if (hit) {
        const product = await fetchStoreProduct(hit.url)
        if (product) nin = { ...product, title }
        else storeDown = true
      }
    } catch {
      // Sin respuesta de la tienda: se sigue con RAWG y LaunchBox, y si nada responde se reintenta más tarde.
      storeDown = true
    }
  }

  // libretro matches on the file name, not on a provider hit, so it can dress a
  // game neither LaunchBox nor RAWG has ever heard of — that long tail of
  // regional releases, fan translations and Japan-only carts is exactly what the
  // archive is good at. Resolved lazily and once: matching scans a few thousand
  // index entries, so a batch where LaunchBox already answers should never pay
  // for it.
  let libretroMemo: string | null | undefined
  const libretroBox = async (): Promise<string | null> => {
    if (libretroMemo === undefined) {
      libretroMemo = retroSystem ? await fetchLibretroCover(fileName ?? title, retroSystem) : null
    }
    return libretroMemo
  }

  // If neither primary source matched there is no info to compose, but a box we
  // already found is still worth keeping: the alternative is leaving those games
  // with no cover at all. This fires whatever the configured cover source is —
  // a game LaunchBox and RAWG have never heard of gets no second chance
  // otherwise, and "no_match" on a game whose box is sitting right there is a
  // poor answer.
  // Name the source that failed: the store, LaunchBox or RAWG, whichever is down.
  const down = storeDown ? { source: 'La tienda de Nintendo', error: '' }
    : lbDown ? { source: 'LaunchBox', error: lbError }
    : rawgDown ? { source: 'RAWG', error: rawgError }
    : null
  // With a rejected key every game that needs RAWG fails the same way. Throwing the key error
  // (not a "no match" and not a retry) lets the batch stop and leave those games untouched.
  if (!lb && !rawg && !nin && rawgAuth) throw rawgAuth
  if (!lb && !rawg && !nin && down) {
    throw new StoreUnavailableError(`${down.source} no responde${down.error ? `: ${down.error}` : ''}`)
  }
  if (!lb && !rawg && !nin && input.coverWithoutMatch === false) return null
  if (!lb && !rawg && !nin) {
    // Only the libretro box can stand alone here: it is matched on the file name.
    const box = await chooseCover({
      chain: input.coverWanted === false ? [] : chains.cover.filter(source => source === 'libretro'),
      urls: { libretro: libretroBox },
      box: input.coverBox,
    })
    if (!box) return null
    return {
      title,
      screenshots: [],
      images: [],
      coverUrl: box.coverUrl,
      coverBuffer: box.buffer,
      coverWidth: box.width,
      coverHeight: box.height,
      sources: { cover: 'libretro' },
      confidence: 0,
    }
  }

  const sources: ComposedMetadata['sources'] = {}

  // ── INFO (title/dev/publisher/genre/year/esrb) ──
  // The first source of the info chain that has the game; Nintendo's store answers when none does.
  const infoFromChain = chains.info
    .map(source => (source === 'launchbox' ? lb : rawg))
    .find(hit => Boolean(hit)) ?? null
  const info = infoFromChain ?? nin ?? null
  const infoSource: 'launchbox' | 'rawg' | 'nintendo' | undefined = info ? (info === lb ? 'launchbox' : info === nin ? 'nintendo' : 'rawg') : undefined
  if (infoSource) sources.info = infoSource
  const facts: NonNullable<ComposedMetadata['facts']> = {}
  if (info && infoSource) {
    if (info.developer)   facts.developer   = infoSource
    if (info.publisher)   facts.publisher   = infoSource
    if (info.releaseYear) facts.releaseYear = infoSource
    if (info.genre)       facts.genre       = infoSource
  }

  // ── DESCRIPTION ──
  // The first source of the description chain that has one.
  let description: string | undefined
  for (const source of chains.description) {
    const text = source === 'launchbox' ? lb?.description : rawg?.description
    if (text) { description = text; sources.description = source; break }
  }

  // ── COVER ──
  // The cover chain, in order. A source's cover is used when it is good enough for the box;
  // a smaller one only when no other source has a good one (cover-choice.ts).
  const cover = await chooseCover({
    chain: input.coverWanted === false ? [] : chains.cover,
    urls: {
      launchbox:   async () => lb?.coverUrl ?? null,
      libretro:    libretroBox,
      steamgriddb: () => fetchSteamGridDBCover(info?.title ?? title),
      nintendo:    async () => nin?.coverUrl ?? null,
    },
    box: input.coverBox,
  })
  const coverUrl = cover?.coverUrl
  const coverBuffer = cover?.buffer
  const coverWidth = cover?.width
  const coverHeight = cover?.height
  if (cover) sources.cover = cover.source

  // ── SCREENSHOTS ──
  // The first source of the screenshot chain that has any.
  let screenshots: string[] = []
  for (const source of chains.screenshots) {
    if (source === 'launchbox' && lb?.screenshots?.length) {
      screenshots = lb.screenshots
      sources.screenshots = 'launchbox'
      break
    }
    if (source === 'rawg' && rawgProvider && rawg?.slug) {
      try {
        const shots = await rawgProvider.fetchScreenshots(rawg.slug)
        if (shots.length) { screenshots = shots; sources.screenshots = 'rawg'; break }
      } catch { /* non-fatal */ }
    }
  }

  const title2 = info?.title ?? title

  return {
    title: title2,
    description,
    facts,
    releaseYear: info?.releaseYear,
    releaseDate: info?.releaseDate,
    genre: info?.genre,
    developer: info?.developer,
    publisher: info?.publisher,
    esrb: info?.esrb,
    coverUrl,
    coverBuffer,
    coverWidth,
    coverHeight,
    screenshots,
    images: lb?.images ?? [],
    sources,
    confidence: Math.max(lbConfidence, rawgConfidence),
    rawgId: rawg?.id,
    rawgSlug: rawg?.slug,
    launchboxId: lb?.id,
  }
}
