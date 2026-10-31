import { db } from '@/lib/db'
import { runAutomatic } from '@/lib/automatic'
import { fillGameFacts } from './wikidata'
import { noMatchRetryAt } from './retry'
import { downloadAndCacheCover, saveCoverFromBuffer } from '@/lib/covers'
import { getRawgProvider, RawgAuthError } from './rawg'
import { scoreForGame } from './one-score'
import { searchYouTubeTrailer, YouTubeApiError, markYoutubeOff, youtubeIsOff } from '@/lib/youtube'
import { AUTO_THRESHOLD } from './scoring'
import { getProviderMatrix, type ProviderMatrix } from './matrix'
import { gatherMetadata } from './compose'
import { keepsCurrentCover } from './cover-choice'
import { libretroSystemFor } from './libretro'
import { consoleSlugFor } from './platform-console'
import { applyMetadata, textPatch, type TextField } from './apply'
import { storeLaunchBoxArt, type ArtBlock } from '@/lib/art'
import type { FieldSource } from './sources'
import { parseMetadataSources, type MetadataSources } from './sources'
import { hasMetadata, isRetryCandidate } from '@/lib/library'
import { BATCH_FIELDS, FICHA_FIELDS, IMAGE_FIELDS, isArtField, runFields, type BatchField } from './scope'
import { fieldHasContent, lowQualityFields, wrongProvenanceFields } from './field-quality'
import { kindFromLaunchBox } from '@/lib/art-catalog'
import { selectionWhere } from './selection'
import { classifyNoMatch, emptyMatchDiagnostics, type NoMatchReason } from './no-match'

// Re-exported for callers that imported these from the batch module historically.
export { AUTO_THRESHOLD, calcConfidence } from './scoring'

export type BatchEventType = 'start' | 'applied' | 'skipped' | 'failed' | 'done'

export interface BatchEvent {
  type:          BatchEventType
  gameId?:       number
  title?:        string
  matchedTitle?: string
  confidence?:   number
  reason?:       string
  /** For a no_match skip: why no source matched (see classifyNoMatch). */
  matchReason?:  NoMatchReason
  processed?:    number
  total?:        number
  applied?:      number
  skipped?:      number
  failed?:       number
  trailerFound?: boolean
  /** Score resolved for this game in the same pass, if any (0–100). */
  score?:        number
  /** Highest Game.id handled so far — persisted as the resume cursor. */
  cursorId?:     number
}

// ── Delay helper ──────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── Main batch processor ──────────────────────────────────────────────────────

/** True when some field of this platform's matrix asks RAWG. */
function usesRawg(matrix: ProviderMatrix): boolean {
  return Object.values(matrix.chains).some(chain => (chain as readonly string[]).includes('rawg'))
}

async function runMetadataBatchInner(opts: {
  emit:             (event: BatchEvent) => void
  signal:           AbortSignal
  withCovers?:      boolean
  withTrailers?:    boolean
  /** Resolve the game's score in the same pass (RAWG metacritic → Metacritic →
   *  LaunchBox community rating). On by default: the metadata providers don't
   *  carry a score, so without this a freshly scanned game has none until
   *  someone remembers to run the separate score job. Costs up to two extra
   *  requests per game, which is why it can be turned off. */
  withScores?:      boolean
  /** Also backfill trailers for games that ALREADY have metadata but no trailer
   *  (without touching their metadata). Used by the admin "Auto Metadata Fetch". */
  backfillTrailers?: boolean
  rateMs?:          number
  apiKey?:          string
  /** Which games to process:
   *   'missing' — only games with no metadata (default; legacy behaviour),
   *   'fill'    — games that have metadata but at least one empty field; only
   *               the empty fields are filled in (existing data is kept),
   *   'redo'    — every game, overwriting all fields from scratch,
   *   'wrong-provider' — games whose stored provenance (metadataSources) does
   *               not match the CURRENT provider matrix; reprocessed (overwrite)
   *               so their data comes from the configured sources.
   *   'autocomplete-scores' — fill ONLY the score (via the RAWG→Metacritic→
   *               LaunchBox chain) for games that currently have no score. */
  mode?:            'missing' | 'fill' | 'redo' | 'wrong-provider' | 'quality' | 'popularity' | 'autocomplete-scores'
  /** The fields this pass may write (see scope.ts). Undefined = every field the mode allows. */
  fields?:          BatchField[]
  /** Keep a cover the owner picked by hand (on by default). Off lets this pass replace it. */
  respectPinned?:   boolean
  /** The quality pass's minimum cover size, as a multiple of the platform box (default COVER_MIN_SCALE). */
  coverMinScale?:   number
  /** popularity mode only: re-fetch even games that already have metrics stored. */
  popularityRedo?:  boolean
  /** Restrict to a single platform slug. Undefined = all platforms. */
  platformSlug?:    string
  /** Resume cursor: only process games with id > resumeAfterId (ordered by id).
   *  Used to continue an interrupted job without redoing earlier games. */
  resumeAfterId?:   number
}) {
  const { emit: rawEmit, signal, withCovers = true, withTrailers = false, withScores = true, backfillTrailers = false, rateMs = 350, apiKey, mode = 'missing', popularityRedo = false, platformSlug, resumeAfterId, fields, respectPinned = true, coverMinScale } = opts

  // Wrap emit so every per-game event also carries cursorId = the game's id.
  // Games are processed in ascending id order, so the runner can persist this as
  // the resume cursor (continue at id > cursorId after an interruption).
  const emit = (event: BatchEvent) =>
    rawEmit(event.gameId != null ? { cursorId: event.gameId, ...event } : event)

  // ── popularity mode: needs RAWG and uses its own selection/loop ──
  // Guard early — this mode only fetches RAWG metrics, the provider matrix below
  // is irrelevant to it.
  const popularityProvider = mode === 'popularity' ? getRawgProvider(apiKey) : null
  if (mode === 'popularity' && !popularityProvider) {
    emit({ type: 'failed', reason: 'RAWG API key not configured' })
    emit({ type: 'done', total: 0, processed: 0, applied: 0, skipped: 0, failed: 1 })
    return
  }

  // Per-field provider matrix (LaunchBox / RAWG / SteamGridDB per category).
  //
  // A run spans several platforms and each one can override any field, so there
  // is no single matrix for the batch: every game resolves the one in force for
  // its own platform. The global matrix only drives the pre-flight guards below,
  // which decide whether the run can produce anything at all.
  const globalMatrix = await getProviderMatrix()
  const matrixCache = new Map<string, ProviderMatrix>()
  const matrixFor = async (slug: string): Promise<ProviderMatrix> => {
    const hit = matrixCache.get(slug)
    if (hit) return hit
    const m = await getProviderMatrix(slug)
    matrixCache.set(slug, m)
    return m
  }

  // RAWG is optional: if a field is set to RAWG but no key is configured, the
  // composer falls back to LaunchBox for that field. We only hard-fail if RAWG
  // is the ONLY possible source AND it's unavailable — i.e. nothing else can
  // produce data (no LaunchBox field selected and no RAWG key).
  const usesAnyLaunchBox =
    globalMatrix.cover === 'launchbox' || globalMatrix.info === 'launchbox' ||
    globalMatrix.description === 'launchbox' || globalMatrix.screenshots === 'launchbox'
  const usesAnyRawg =
    globalMatrix.info === 'rawg' ||
    globalMatrix.description === 'rawg' || globalMatrix.screenshots === 'rawg'
  if (!usesAnyLaunchBox && usesAnyRawg && !getRawgProvider(apiKey)) {
    emit({ type: 'failed', reason: 'RAWG API key not configured' })
    emit({ type: 'done', total: 0, processed: 0, applied: 0, skipped: 0, failed: 1 })
    return
  }

  // What this pass writes, field by field: the fields the admin chose, inside what the mode
  // allows. The mode decides who; the fields decide what. A quality or provenance pass narrows
  // that per game: only the fields that are low quality, or whose source is outside the
  // platform's chain, are written, and the game's other fields are left as they are.
  const passFields = new Set<BatchField>(runFields(mode, fields, { withTrailers, withScores }))
  const planFor = (set: ReadonlySet<BatchField>) => {
    const want = (f: BatchField) => set.has(f)
    const inFicha = FICHA_FIELDS.some(want)
    const inImagenes = IMAGE_FIELDS.some(want)
    const inScores = want('score') || want('metacritic')
    return {
      want,
      inFicha,
      inImagenes,
      inScores,
      trailersOn: want('trailer'),
      coversOn: want('cover') && withCovers,
      scoresOn: inScores,
      // Wikidata facts fill genre, developer, publisher and year: only when one of them is chosen.
      factsOn: want('genre') || want('developer') || want('publisher') || want('releaseYear'),
      // Identifiers (rawgId, rawgSlug, launchboxId) move only with the ficha or the art.
      ownsIdentity: inFicha || inImagenes,
      metaScope: inFicha || inImagenes || inScores,
      // The LaunchBox art blocks this pass writes.
      artOnly: new Set<ArtBlock>((['backdrop', 'tile', 'logo'] as const).filter(want)),
      // The LaunchBox image kinds this pass stores: the art fields it chose, and the kinds the
      // background, tile and logo blocks are picked from. Other kinds are not downloaded at all.
      artKinds: new Set<string>([
        ...BATCH_FIELDS.filter(f => isArtField(f) && want(f)).map(f => f.slice(4)),
        ...(want('backdrop') ? ['banner', 'fanart'] : []),
        ...(want('tile') ? ['fanart'] : []),
        ...(want('logo') ? ['clear-logo'] : []),
      ]),
    }
  }
  // The pass-level plan. Each game then takes its own (see the loop).
  let { want, inFicha, inImagenes, inScores, trailersOn, coversOn, scoresOn, factsOn, ownsIdentity, metaScope, artOnly, artKinds } = planFor(passFields)

  // Resume: only games after the cursor (ordered by id, see below). Nothing to write
  // selects nothing, and the run ends at once.
  // While the YouTube API is off (see markYoutubeOff), no game is selected for its trailer.
  const youtubeOff = await youtubeIsOff()
  const where = selectionWhere({
    mode, fields: [...passFields], platformSlug, resumeAfterId,
    backfillTrailers, trailersOff: youtubeOff, popularityRedo, now: new Date(),
  })
  // Ordered by id so the resume cursor (id > resumeAfterId) is monotonic.
  let games = where ? await db.game.findMany({ where, include: { platform: true }, orderBy: { id: 'asc' } }) : []

  // A provenance pass is judged against the matrix in force for each game's OWN platform: a
  // per-platform override can make the same provenance right for one console and wrong for
  // another. Resolved up front so the per-game decision stays synchronous.
  if (mode === 'wrong-provider') await Promise.all([...new Set(games.map(g => g.platform.slug))].map(matrixFor))

  // The fields this pass writes for one game: a quality pass its low-quality fields, a provenance
  // pass the fields whose source is outside the platform's chain, and any other pass what it asked.
  const fieldsFor = (game: (typeof games)[number]): Set<BatchField> => {
    if (mode === 'quality') return new Set(lowQualityFields(game, [...passFields], { coverMinScale }))
    if (mode === 'wrong-provider') {
      const chains = (matrixCache.get(game.platform.slug) ?? globalMatrix).chains
      return new Set(wrongProvenanceFields(parseMetadataSources(game.metadataSources), [...passFields], chains, f => fieldHasContent(game, f)))
    }
    return passFields
  }
  // A quality or provenance pass keeps only the games that have a field to write.
  if (mode === 'quality' || mode === 'wrong-provider') games = games.filter(g => fieldsFor(g).size > 0)

  const total = games.length
  emit({ type: 'start', total })

  let applied = 0, skipped = 0, failed = 0
  // How many games the loop reached. A run that stops early (rejected key, abort) must not
  // report the rest of the library as processed.
  let attempted = 0
  // Set when RAWG refuses (rejected key or spent monthly quota): the rest of the run goes on
  // without it, and a game only RAWG could answer is left as it is.
  let rawgOff = false
  // Once the YouTube API errors (quota / bad key / network), stop searching
  // trailers for the rest of the run, and for a day after it (markYoutubeOff).
  let youtubeDisabled = youtubeOff

  for (let i = 0; i < games.length; i++) {
    if (signal.aborted) break

    const game = games[i]
    const processed = i + 1
    attempted = processed
    // This game's own fields, and the plan they give.
    ;({ want, inFicha, inImagenes, inScores, trailersOn, coversOn, scoresOn, factsOn, ownsIdentity, metaScope, artOnly, artKinds } = planFor(fieldsFor(game)))

    // ── popularity mode: fetch & store RAWG metrics only ──────────────────────
    // Placed first so it isn't short-circuited by the metadata-mode branches.
    // Writes only the rawg* metric columns + popularityFetchedAt (the idempotency
    // marker); never touches metadataFetchedAt/metadataSources.
    if (mode === 'popularity') {
      try {
        await delay(rateMs)
        if (signal.aborted) break
        const m = await popularityProvider!.fetchPopularity(game.rawgId!)
        if (!m) {
          skipped++
          emit({ type: 'skipped', gameId: game.id, title: game.title, reason: 'no_rawg_data', processed, total, applied, skipped, failed })
          continue
        }
        // Score: prefer RAWG's own metacritic; otherwise run the centralized
        // fallback chain (Metacritic scraper → LaunchBox community rating). Only
        // for games RAWG left without a metascore.
        //
        // A score the metadata pass already resolved is left alone unless RAWG
        // has a real metascore (which outranks it) or the admin asked for a
        // re-fetch — otherwise this pass would replace a Metacritic with RAWG's
        // user rating, or wipe it when RAWG knows nothing.
        const scoreWanted = inScores
        const keepScore = !popularityRedo && game.rawgScore != null && m.metacritic == null
        // The same score rule as every other path (one-score.ts), on the metrics just fetched.
        const scored = !scoreWanted || keepScore ? null : await scoreForGame(
          { title: game.title, platformSlug: game.platform.slug, consoleSlug: consoleSlugFor(game.platform.slug, game), rawgId: game.rawgId },
          apiKey, rateMs, m,
        )
        await applyMetadata(game.id, {
          origin: 'auto',
          data: {
            ...(want('popularity') ? { rawgAdded: m.added } : {}),
            ...(want('rating') ? { rawgRating: m.rating } : {}),
            ...(scored && want('metacritic') ? { rawgMetacritic: scored.rawgMetacritic } : {}),
            ...(scored && want('score') ? { rawgScore: scored.rawgScore, scoreSource: scored.scoreSource } : {}),
            popularityFetchedAt: new Date(),
          },
        })
        applied++
        emit({ type: 'applied', gameId: game.id, title: game.title, matchedTitle: game.title, processed, total, applied, skipped, failed })
      } catch (err) {
        failed++
        emit({ type: 'failed', gameId: game.id, title: game.title, reason: err instanceof Error ? err.message : 'unknown_error', processed, total, applied, skipped, failed })
        // A rejected RAWG key: the run stops here, as in the metadata-mode catch below.
        if (err instanceof RawgAuthError) break
      }
      continue
    }

    // ── autocomplete-scores mode: fill ONLY the score for games that lack one ──
    // Runs the full chain (RAWG metacritic by rawgId → Metacritic → LaunchBox).
    // Idempotent via the where-clause (rawgScore null); writes score + source.
    if (mode === 'autocomplete-scores') {
      try {
        await delay(rateMs)
        if (signal.aborted) break
        const r = await scoreForGame(
          { title: game.title, platformSlug: game.platform.slug, consoleSlug: consoleSlugFor(game.platform.slug, game), rawgId: game.rawgId },
          apiKey, rateMs,
        )
        if (!r) {
          skipped++
          emit({ type: 'skipped', gameId: game.id, title: game.title, reason: 'no_score_found', processed, total, applied, skipped, failed })
          continue
        }
        await applyMetadata(game.id, {
          origin: 'auto',
          data: {
            ...(want('score') ? { rawgScore: r.rawgScore, scoreSource: r.scoreSource } : {}),
            ...(want('metacritic') && r.rawgMetacritic != null ? { rawgMetacritic: r.rawgMetacritic } : {}),
            popularityFetchedAt: new Date(),
          },
        })
        applied++
        emit({ type: 'applied', gameId: game.id, title: game.title, matchedTitle: game.title, processed, total, applied, skipped, failed })
      } catch (err) {
        failed++
        emit({ type: 'failed', gameId: game.id, title: game.title, reason: err instanceof Error ? err.message : 'unknown_error', processed, total, applied, skipped, failed })
      }
      continue
    }

    // ── Trailer-only work: the scope is trailers alone, or a game already has its
    // metadata and only waits for a trailer (missing mode). Nothing else is written.
    if (!metaScope || (mode === 'missing' && hasMetadata(game) && !isRetryCandidate(game))) {
      if (!trailersOn || (game.trailerUrl && mode !== 'redo')) {
        // nothing to do (shouldn't normally be selected) — count as skipped silently
        skipped++
        emit({ type: 'skipped', gameId: game.id, title: game.title, reason: 'has_metadata', processed, total, applied, skipped, failed })
        continue
      }
      if (youtubeDisabled) {
        skipped++
        emit({ type: 'skipped', gameId: game.id, title: game.title, reason: 'youtube_disabled', processed, total, applied, skipped, failed })
        continue
      }
      try {
        await delay(rateMs)
        if (signal.aborted) break
        const url = await searchYouTubeTrailer(game.title)
        if (url) {
          await applyMetadata(game.id, { origin: 'auto', data: { trailerUrl: url } })
          applied++
          emit({ type: 'applied', gameId: game.id, title: game.title, matchedTitle: game.title, trailerFound: true, processed, total, applied, skipped, failed })
        } else {
          skipped++
          emit({ type: 'skipped', gameId: game.id, title: game.title, reason: 'no_trailer', processed, total, applied, skipped, failed })
        }
      } catch (err) {
        if (err instanceof YouTubeApiError) {
          youtubeDisabled = true
          // Only an answer from the API (quota, key, disabled) is kept for a day; a timeout is retried next run.
          if (err.httpStatus != null) await markYoutubeOff().catch(() => {})
          skipped++
          emit({ type: 'skipped', gameId: game.id, title: game.title, reason: 'youtube_error', processed, total, applied, skipped, failed })
        } else {
          failed++
          emit({ type: 'failed', gameId: game.id, title: game.title, reason: err instanceof Error ? err.message : 'unknown_error', processed, total, applied, skipped, failed })
        }
      }
      continue
    }

    // ── Full flow: the game's metadata, written field by field ─────────────────
    try {
      await delay(rateMs)
      if (signal.aborted) break

      // Compose metadata across providers per the matrix (LaunchBox/RAWG/SGDB).
      const diag = emptyMatchDiagnostics()
      // The cover is asked only when this pass will write it: the box is the platform's own size.
      const coverWanted = coversOn && !(respectPinned && parseMetadataSources(game.metadataSources).coverManual === true)
        && (mode !== 'fill' || !game.coverPath)
      let meta = await gatherMetadata({
        coverWanted,
        coverBox: {
          width: game.platform.thumbnailWidth,
          height: game.platform.thumbnailHeight,
          altWidth: game.platform.altThumbnailWidth,
          altHeight: game.platform.altThumbnailHeight,
        },
        diagnostics:  diag,
        // A game without a ficha that no provider matched gets no cover: the libretro box it would keep has no ficha behind it.
        coverWithoutMatch: game.metadataFetchedAt != null,
        title:        game.title,
        platformSlug: game.platform.slug,
        fileName:     game.fileName,
        retroSystem:  libretroSystemFor(game.platform.slug, game),
        launchboxId:  game.launchboxId,
        matrix:       await matrixFor(game.platform.slug),
        rawgApiKey:   apiKey,
        rawgOff,
        threshold:    AUTO_THRESHOLD,
      })
      const matchReason = classifyNoMatch(diag)
      // RAWG refused while looking this game up: it is off for the rest of the run, even for
      // games that LaunchBox answered, so no further RAWG request is spent.
      if (diag.rawgRefused) rawgOff = true

      // Nothing matched while RAWG is off, and RAWG was one of the sources for this platform:
      // RAWG might have answered, so the game is left as it is and tried again in a later run.
      if (!meta && rawgOff && usesRawg(await matrixFor(game.platform.slug))) {
        skipped++
        emit({ type: 'skipped', gameId: game.id, title: game.title, reason: 'rawg_unavailable', processed, total, applied, skipped, failed })
        continue
      }

      if (!meta) {
        // The no-match state describes the ficha, so a pass without it leaves the state alone.
        if (inFicha) {
          // The reason is written before fillGameFacts runs, which never touches it.
          await applyMetadata(game.id, {
            origin: 'auto',
            data: { metadataStatus: 'no_match', metadataAttempts: { increment: 1 }, metadataNextRetryAt: noMatchRetryAt(), metadataReason: matchReason },
          }).catch(() => {})
          // The platform's own providers found nothing: Wikidata is the last word.
          if (factsOn) await fillGameFacts(game.id).catch(() => [] as string[])
        }
        skipped++
        emit({ type: 'skipped', gameId: game.id, title: game.title, reason: 'no_match', matchReason, processed, total, applied, skipped, failed })
        continue
      }

      // In 'fill' mode we only touch fields that are currently empty and avoid
      // re-downloading assets the game already has. 'redo'/'missing' overwrite.
      const fillOnly = mode === 'fill'
      const isEmpty = (v: unknown) => v === null || v === undefined || v === ''

      const prevSourcesAll = parseMetadataSources(game.metadataSources)
      // A cover the owner picked by hand survives every automated pass while respectPinned
      // is on (the default). Off, a pass may replace it.
      const coverLocked = respectPinned && prevSourcesAll.coverManual === true

      // A pass replaces the cover only with a better one: when the game's cover is as good
      // as the new candidate (by shape and size, see cover-choice.ts), the candidate is dropped
      // and the cover stays. The match itself is not affected.
      let coverKept = false
      // Quality and provenance passes judged the cover before downloading it: what they download is
      // applied. Dropping it here left the correct provider's cover downloaded and never used, and the
      // wrong one in place, so the next pass judged it again.
      const judgedCover = mode === 'quality' || mode === 'wrong-provider'
      if (!judgedCover && meta.coverUrl && (game.coverPath || game.coverUrl) && keepsCurrentCover(
        { width: game.coverWidth, height: game.coverHeight },
        { width: meta.coverWidth, height: meta.coverHeight },
        { width: game.platform.thumbnailWidth, height: game.platform.thumbnailHeight, altWidth: game.platform.altThumbnailWidth, altHeight: game.platform.altThumbnailHeight },
      )) {
        const { cover: _cover, ...sourcesWithoutCover } = meta.sources
        meta = { ...meta, coverUrl: undefined, coverBuffer: undefined, coverWidth: undefined, coverHeight: undefined, sources: sourcesWithoutCover }
        coverKept = true
      }

      // Cover: only (re)download when overwriting, or when the local file is missing (fill).
      let coverPath: string | undefined
      const needCover = coversOn && !coverLocked && (!fillOnly || isEmpty(game.coverPath))
      if (meta.coverUrl && needCover) {
        try {
          coverPath = meta.coverBuffer
            ? await saveCoverFromBuffer(meta.coverBuffer, game.platform.slug, game.id)
            : await downloadAndCacheCover(meta.coverUrl, game.platform.slug, game.id)
        } catch { /* cover download failure is non-fatal */ }
      }

      // YouTube trailer (skipped once the API errors; in fill, only if missing).
      let trailerUrl: string | undefined
      let trailerFound = false
      if (trailersOn && !youtubeDisabled && (!fillOnly || isEmpty(game.trailerUrl))) {
        try {
          const url = await searchYouTubeTrailer(meta.title)
          if (url) { trailerUrl = url; trailerFound = true }
        } catch (err) {
          if (err instanceof YouTubeApiError) {
            youtubeDisabled = true
            if (err.httpStatus != null) await markYoutubeOff().catch(() => {})
          }
        }
        await delay(rateMs)
        if (signal.aborted) break
      }

      // Score. No metadata provider carries one, so it has its own chain (RAWG
      // metacritic → Metacritic → LaunchBox community rating). Only for games that don't
      // have one — 'redo' re-derives everything. Only the score fields chosen are written.
      let scoreData: { rawgScore?: number; scoreSource?: string; rawgMetacritic?: number } = {}
      if (scoresOn && (mode === 'redo' || game.rawgScore == null)) {
        // The same score rule as the fill button (one-score.ts): RAWG metacritic,
        // else RAWG rating x20, else the Metacritic/LaunchBox chain.
        await delay(rateMs)
        const r = await scoreForGame(
          { title: meta.title || game.title, platformSlug: game.platform.slug, consoleSlug: consoleSlugFor(game.platform.slug, game), rawgId: meta.rawgId ?? game.rawgId },
          apiKey,
          rateMs,
        )
        if (r) {
          scoreData = {
            ...(want('score') ? { rawgScore: r.rawgScore, scoreSource: r.scoreSource } : {}),
            // Only a critic metascore belongs in rawgMetacritic (one-score.ts keeps it apart).
            ...(want('metacritic') && r.rawgMetacritic != null ? { rawgMetacritic: r.rawgMetacritic } : {}),
          }
        }
        if (signal.aborted) break
      }

      const screenshotsJson = want('screenshots') && meta.screenshots.length > 0 ? JSON.stringify(meta.screenshots) : undefined

      // Build the update: fill = only currently-empty fields; otherwise overwrite all.
      // Only the fields chosen for this pass are written.
      const data = fillOnly
        ? {
            ...(want('description') && isEmpty(game.description) && meta.description && { description: meta.description }),
            ...(want('releaseYear') && isEmpty(game.releaseYear) && meta.releaseYear != null && { releaseYear: meta.releaseYear }),
            ...(want('releaseDate') && isEmpty(game.releaseDate) && meta.releaseDate && { releaseDate: meta.releaseDate }),
            ...(want('genre') && isEmpty(game.genre) && meta.genre && { genre: meta.genre }),
            ...(want('developer') && isEmpty(game.developer) && meta.developer && { developer: meta.developer }),
            ...(want('publisher') && isEmpty(game.publisher) && meta.publisher && { publisher: meta.publisher }),
            ...(want('cover') && !coverLocked && isEmpty(game.coverUrl) && meta.coverUrl && { coverUrl: meta.coverUrl }),
            ...(want('screenshots') && isEmpty(game.screenshotPaths) && screenshotsJson && { screenshotPaths: screenshotsJson }),
            ...(game.rawgId == null && meta.rawgId != null && { rawgId: meta.rawgId }),
            ...(!game.rawgSlug && meta.rawgSlug && { rawgSlug: meta.rawgSlug }),
            ...(coverPath  && { coverPath }),   // only set when needCover was true
            ...(trailerUrl && { trailerUrl }),
          }
        : {
            ...(want('title') ? { title: meta.title } : {}),
            ...(want('description') ? { description: meta.description } : {}),
            ...(want('releaseYear') ? { releaseYear: meta.releaseYear } : {}),
            ...(want('releaseDate') ? { releaseDate: meta.releaseDate } : {}),
            ...(want('genre') ? { genre: meta.genre } : {}),
            ...(want('developer') ? { developer: meta.developer } : {}),
            ...(want('publisher') ? { publisher: meta.publisher } : {}),
            ...(want('cover') && !coverLocked ? { coverUrl: meta.coverUrl } : {}),
            ...(screenshotsJson && { screenshotPaths: screenshotsJson }),
            // Identifiers move only with the ficha or the art; any other pass fills a missing one.
            ...(meta.rawgId != null && (ownsIdentity || game.rawgId == null) && { rawgId: meta.rawgId }),
            ...(meta.rawgSlug && (ownsIdentity || !game.rawgSlug) && { rawgSlug: meta.rawgSlug }),
            ...(meta.launchboxId != null && (ownsIdentity || game.launchboxId == null) && { launchboxId: meta.launchboxId }),
            ...(coverPath  && { coverPath }),
            ...(trailerUrl && { trailerUrl }),
          }

      // Provenance: fill merges what it wrote over the old record. The other passes rebuild the
      // labels of what they write and keep the labels of what they leave alone.
      const prevSources: MetadataSources = fillOnly
        ? prevSourcesAll
        : {
            ...((!want('cover') || coverKept) && { cover: prevSourcesAll.cover, coverManual: prevSourcesAll.coverManual }),
            ...(!want('screenshots') && { screenshots: prevSourcesAll.screenshots }),
          }
      // Only attribute sources for fields we actually wrote.
      const writtenSources: MetadataSources = fillOnly
        ? Object.fromEntries(
            Object.entries(meta.sources).filter(([k]) => {
              if (k === 'cover')       return 'coverUrl' in data || 'coverPath' in data
              if (k === 'description') return 'description' in data
              if (k === 'screenshots') return 'screenshotPaths' in data
              if (k === 'info')        return ['genre', 'developer', 'publisher', 'releaseYear'].some(f => f in data)
              return false
            }),
          )
        : Object.fromEntries(
            Object.entries(meta.sources).filter(([k]) => (k === 'cover' ? want('cover') : k === 'screenshots' ? want('screenshots') : true)),
          )
      const merged: MetadataSources = { ...prevSources, ...writtenSources }
      // The lock also protects the badge: we didn't touch the image, so the
      // hand-picked provenance stays instead of being relabelled as the
      // provider's, which is what it would look like otherwise.
      if (coverLocked) {
        if (prevSourcesAll.cover) merged.cover = prevSourcesAll.cover
        else delete merged.cover
        merged.coverManual = true
      }
      // A cover this pass replaces is no longer the owner's pick: its label is the provider's.
      const coverReplaced = Boolean(coverPath) || Boolean((data as { coverUrl?: string }).coverUrl)
      if (!coverLocked && coverReplaced) delete merged.coverManual
      // The cover and screenshot labels, only for the images this pass writes.
      const imageSources = want('cover') || want('screenshots')
        ? {
            ...(want('cover') && { cover: merged.cover, coverManual: merged.coverManual }),
            ...(want('screenshots') && { screenshots: merged.screenshots }),
          }
        : undefined

      // In fill mode, if nothing was actually empty, don't write (and don't bump
      // metadataFetchedAt) — count it as skipped so we don't churn existing data.
      if (fillOnly && Object.keys(data).length === 0 && Object.keys(scoreData).length === 0) {
        skipped++
        emit({ type: 'skipped', gameId: game.id, title: game.title, reason: 'nothing_to_fill', processed, total, applied, skipped, failed })
        continue
      }

      // Art from the same LaunchBox page: the blocks this pass writes (background, tile, logo).
      const artImages = meta.images.filter(i => artKinds.has(kindFromLaunchBox(i.type)))
      if (artImages.length > 0) {
        await storeLaunchBoxArt(
          { id: game.id, platformSlug: game.platform.slug, fileName: game.fileName },
          artImages,
          { found: true, launchboxId: meta.launchboxId, paceMs: 250, only: artOnly },
        ).catch(() => 'no-art' as const)
      }

      // Text values carry the provider that gave them; the rest are plain columns.
      const row = data as Record<string, unknown>
      const { title: _t, description: _d, releaseYear: _y, genre: _g, developer: _dv, publisher: _p, ...columns } = row
      const facts = meta.facts as Partial<Record<TextField, FieldSource>> | undefined
      const patch = textPatch(
        { title: row.title, description: row.description, releaseYear: row.releaseYear, genre: row.genre, developer: row.developer, publisher: row.publisher } as Partial<Record<TextField, unknown>>,
        f => f === 'description' ? meta.sources.description : (facts?.[f] ?? meta.sources.info),
      )
      // A cover-only result is not a ficha. The box is kept, but a game that never had a
      // ficha goes back into the retry cycle as no_match instead of reading as "matched".
      // Without the ficha in scope, the ficha state is left as it is.
      const coverOnly = !meta.sources.info && !game.metadataFetchedAt
      const statusWrite = !inFicha
        ? {}
        : coverOnly
          ? { metadataStatus: 'no_match', metadataAttempts: { increment: 1 }, metadataNextRetryAt: noMatchRetryAt(), metadataReason: matchReason }
          : { metadataStatus: 'matched', metadataAttempts: 0, metadataNextRetryAt: null, metadataReason: null }
      await applyMetadata(game.id, {
        origin: 'auto',
        patch,
        sources: imageSources,
        data: {
          ...columns,
          ...scoreData,
          // Only stamp the marker when actual metadata arrived. A cover-only
          // result — the rescue for games no provider has heard of, which returns
          // a box and nothing else — would otherwise mark the game as "done" and
          // drop it out of the pending count with no description, year or genre
          // to show for it.
          ...(inFicha && meta.sources.info ? { metadataFetchedAt: new Date() } : {}),
          ...statusWrite,
        },
      })

      applied++
      // Facts the preferred providers left empty: Wikidata fills them, never overwriting.
      if (factsOn) await fillGameFacts(game.id).catch(() => [] as string[])
      emit({ type: 'applied', gameId: game.id, title: game.title, matchedTitle: meta.title, confidence: meta.confidence, trailerFound, score: scoreData.rawgScore, processed, total, applied, skipped, failed })

    } catch (err) {
      // A rejected RAWG key or a spent monthly quota (RAWG answers both with 401): RAWG is off for
      // the rest of the run. This game is left as it is, with no backoff and no no_match.
      if (err instanceof RawgAuthError) {
        rawgOff = true
        skipped++
        emit({ type: 'skipped', gameId: game.id, title: game.title, reason: 'rawg_unavailable', processed, total, applied, skipped, failed })
        continue
      }
      failed++
      const reason = err instanceof Error ? err.message : 'unknown_error'
      // Provider error: wait 1, 2, 4... hours (at most a day) before the next try (#110).
      // The retry state belongs to the ficha, so a pass without it leaves the game as it is.
      if (inFicha) {
        const attempts = game.metadataAttempts + 1
        const waitHours = Math.min(24, 2 ** (attempts - 1))
        await applyMetadata(game.id, {
          origin: 'auto',
          data: {
            metadataStatus: 'provider_error',
            metadataAttempts: { increment: 1 },
            metadataNextRetryAt: new Date(Date.now() + waitHours * 3600_000),
            metadataReason: null,
          },
        }).catch(() => {})
      }
      emit({ type: 'failed', gameId: game.id, title: game.title, reason, processed, total, applied, skipped, failed })
    }
  }

  emit({ type: 'done', total, processed: attempted, applied, skipped, failed })
}

/** The metadata batch is automatic work: it never overwrites what the owner set by hand. */
export function runMetadataBatch(opts: Parameters<typeof runMetadataBatchInner>[0]) {
  return runAutomatic(() => runMetadataBatchInner(opts))
}
