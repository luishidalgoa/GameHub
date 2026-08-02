import { db } from '@/lib/db'
import { downloadAndCacheCover } from '@/lib/covers'
import { getRawgProvider } from './rawg'
import { fetchGameScore } from './scoreChain'
import { unifiedScore } from './popularity'
import { searchYouTubeTrailer, YouTubeApiError } from '@/lib/youtube'
import { AUTO_THRESHOLD } from './scoring'
import { getProviderMatrix, type ProviderMatrix } from './matrix'
import { gatherMetadata } from './compose'
import { parseMetadataSources, type MetadataSources } from './sources'

// Re-exported for callers that imported these from the batch module historically.
export { AUTO_THRESHOLD, REVIEW_THRESHOLD, calcConfidence } from './scoring'

export type BatchEventType = 'start' | 'applied' | 'skipped' | 'failed' | 'done'

export interface BatchEvent {
  type:          BatchEventType
  gameId?:       number
  title?:        string
  matchedTitle?: string
  confidence?:   number
  reason?:       string
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

export async function runMetadataBatch(opts: {
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
  mode?:            'missing' | 'fill' | 'redo' | 'wrong-provider' | 'popularity' | 'autocomplete-scores'
  /** popularity mode only: re-fetch even games that already have metrics stored. */
  popularityRedo?:  boolean
  /** Restrict to a single platform slug. Undefined = all platforms. */
  platformSlug?:    string
  /** Resume cursor: only process games with id > resumeAfterId (ordered by id).
   *  Used to continue an interrupted job without redoing earlier games. */
  resumeAfterId?:   number
}) {
  const { emit: rawEmit, signal, withCovers = true, withTrailers = false, withScores = true, backfillTrailers = false, rateMs = 350, apiKey, mode = 'missing', popularityRedo = false, platformSlug, resumeAfterId } = opts

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
    globalMatrix.cover === 'rawg' || globalMatrix.info === 'rawg' ||
    globalMatrix.description === 'rawg' || globalMatrix.screenshots === 'rawg'
  if (!usesAnyLaunchBox && usesAnyRawg && !getRawgProvider(apiKey)) {
    emit({ type: 'failed', reason: 'RAWG API key not configured' })
    emit({ type: 'done', total: 0, processed: 0, applied: 0, skipped: 0, failed: 1 })
    return
  }

  // Fields considered "metadata" for the gap detection used by 'fill' mode.
  // A missing score counts as a gap like any other — otherwise a game with
  // complete metadata and no score is never selected, and "fill the gaps" leaves
  // the one gap it has.
  const GAP_FIELDS = [
    { description: null },
    { genre: null },
    { developer: null },
    { publisher: null },
    { releaseYear: null },
    { coverPath: null },
    { screenshotPaths: null },
    ...(withTrailers ? [{ trailerUrl: null }] : []),
    ...(withScores ? [{ rawgScore: null }] : []),
  ]

  const platformFilter = platformSlug ? { platform: { slug: platformSlug } } : {}
  // Resume: only games after the cursor (ordered by id, see below).
  const resumeFilter = resumeAfterId ? { id: { gt: resumeAfterId } } : {}

  // Build the selection per mode:
  //   missing        → no metadata yet (+ optional trailer-only backfill)
  //   fill           → has metadata but at least one empty field
  //   redo           → every (visible) game
  //   wrong-provider → has metadata; provenance filtered in JS below (JSON field)
  const where =
    mode === 'popularity'
      ? {
          isHidden: false,
          ...platformFilter,
          ...resumeFilter,
          rawgId: { not: null },                                       // only games we can look up
          ...(popularityRedo ? {} : { popularityFetchedAt: null }),    // idempotent: skip already-fetched
        }
    : mode === 'autocomplete-scores'
      ? {
          isHidden: false,
          ...platformFilter,
          ...resumeFilter,
          rawgScore: null,                                             // only games WITHOUT a score (idempotent)
        }
    : mode === 'redo' || mode === 'wrong-provider'
      ? { isHidden: false, ...platformFilter, ...resumeFilter }
      : mode === 'fill'
        ? { isHidden: false, ...platformFilter, ...resumeFilter, OR: GAP_FIELDS }
        : {
            isHidden: false,
            ...platformFilter,
            ...resumeFilter,
            OR: [
              { metadataFetchedAt: null },
              ...(withTrailers && backfillTrailers ? [{ trailerUrl: null }] : []),
            ],
          }

  // Ordered by id so the resume cursor (id > resumeAfterId) is monotonic.
  let games = await db.game.findMany({
    where,
    include: { platform: true },
    orderBy: { id: 'asc' },
  })

  // 'wrong-provider': keep only games whose stored provenance disagrees with the
  // current matrix (any field whose source ≠ the configured provider, or that
  // was never recorded). Done in JS because metadataSources is a JSON string.
  if (mode === 'wrong-provider') {
    // Judged against the matrix in force for each game's OWN platform: with a
    // per-platform override, the same provenance can be right for one console
    // and wrong for another. Resolved up front so the filter stays synchronous.
    await Promise.all([...new Set(games.map(g => g.platform.slug))].map(matrixFor))
    games = games.filter(g => {
      const m = matrixCache.get(g.platform.slug) ?? globalMatrix
      const wanted: Record<string, string> = {
        cover:       m.cover,
        info:        m.info,
        description: m.description,
        screenshots: m.screenshots,
      }
      const src = parseMetadataSources(g.metadataSources)
      // Mismatch if any field that the matrix actively sources (≠ 'none') is
      // missing from provenance or recorded from a different provider.
      return (['cover', 'info', 'description', 'screenshots'] as const).some(f => {
        if (wanted[f] === 'none') return false
        // A hand-picked cover is a deliberate override, not a provider drift:
        // it never counts as a mismatch, or this sweep would exist to undo it.
        if (f === 'cover' && src.coverManual) return false
        return src[f] !== wanted[f]
      })
    })
  }

  const total = games.length
  emit({ type: 'start', total })

  let applied = 0, skipped = 0, failed = 0
  // Once the YouTube API errors (quota / bad key / network), stop searching
  // trailers for the rest of the run instead of failing every game.
  let youtubeDisabled = false

  for (let i = 0; i < games.length; i++) {
    if (signal.aborted) break

    const game = games[i]
    const processed = i + 1

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
        const keepScore = !popularityRedo && game.rawgScore != null && m.metacritic == null
        let metacritic = m.metacritic            // critic score → rawgMetacritic
        let score      = unifiedScore({ rawgMetacritic: m.metacritic, rawgRating: m.rating })
        let source: string | null = m.metacritic != null ? 'rawg' : (score != null ? 'rawg' : null)
        if (metacritic == null && !keepScore) {
          if (signal.aborted) break
          const r = await fetchGameScore({
            title: game.title, platformSlug: game.platform.slug,
            rawgMetacritic: m.metacritic, rateMs, apiKey,
          })
          if (r) {
            score  = r.score
            source = r.source
            if (r.isCritic) metacritic = r.score   // only critic scores go to rawgMetacritic
          }
        }
        await db.game.update({
          where: { id: game.id },
          data: {
            rawgAdded:           m.added,
            rawgRating:          m.rating,
            rawgRatingsCount:    m.ratingsCount,
            ...(keepScore ? {} : { rawgMetacritic: metacritic, rawgScore: score, scoreSource: source }),
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

    // ── autocomplete-scores mode: fill ONLY the score for games that lack one ──
    // Runs the full chain (RAWG metacritic by rawgId → Metacritic → LaunchBox).
    // Idempotent via the where-clause (rawgScore null); writes score + source.
    if (mode === 'autocomplete-scores') {
      try {
        await delay(rateMs)
        if (signal.aborted) break
        const r = await fetchGameScore({
          title: game.title, platformSlug: game.platform.slug,
          rawgId: game.rawgId, rateMs, apiKey,
        })
        if (!r) {
          skipped++
          emit({ type: 'skipped', gameId: game.id, title: game.title, reason: 'no_score_found', processed, total, applied, skipped, failed })
          continue
        }
        await db.game.update({
          where: { id: game.id },
          data: {
            rawgScore:           r.score,
            scoreSource:         r.source,
            ...(r.isCritic ? { rawgMetacritic: r.score } : {}),
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

    // ── Trailer-only backfill: game already has metadata, just needs a trailer ─
    // Only in 'missing' mode; 'fill'/'redo' send every game through the full flow.
    if (mode === 'missing' && game.metadataFetchedAt !== null) {
      if (!withTrailers || game.trailerUrl) {
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
          await db.game.update({ where: { id: game.id }, data: { trailerUrl: url } })
          applied++
          emit({ type: 'applied', gameId: game.id, title: game.title, matchedTitle: game.title, trailerFound: true, processed, total, applied, skipped, failed })
        } else {
          skipped++
          emit({ type: 'skipped', gameId: game.id, title: game.title, reason: 'no_trailer', processed, total, applied, skipped, failed })
        }
      } catch (err) {
        if (err instanceof YouTubeApiError) {
          youtubeDisabled = true
          skipped++
          emit({ type: 'skipped', gameId: game.id, title: game.title, reason: 'youtube_error', processed, total, applied, skipped, failed })
        } else {
          failed++
          emit({ type: 'failed', gameId: game.id, title: game.title, reason: err instanceof Error ? err.message : 'unknown_error', processed, total, applied, skipped, failed })
        }
      }
      continue
    }

    // ── Full flow: game has no metadata ───────────────────────────────────────
    try {
      await delay(rateMs)
      if (signal.aborted) break

      // Compose metadata across providers per the matrix (LaunchBox/RAWG/SGDB).
      const meta = await gatherMetadata({
        title:        game.title,
        platformSlug: game.platform.slug,
        fileName:     game.fileName,
        matrix:       await matrixFor(game.platform.slug),
        rawgApiKey:   apiKey,
        threshold:    AUTO_THRESHOLD,
      })

      if (!meta) {
        skipped++
        emit({ type: 'skipped', gameId: game.id, title: game.title, reason: 'no_match', processed, total, applied, skipped, failed })
        continue
      }

      // In 'fill' mode we only touch fields that are currently empty and avoid
      // re-downloading assets the game already has. 'redo'/'missing' overwrite.
      const fillOnly = mode === 'fill'
      const isEmpty = (v: unknown) => v === null || v === undefined || v === ''

      const prevSourcesAll = parseMetadataSources(game.metadataSources)
      // A cover the admin picked by hand survives every automated pass. Only
      // 'redo' — the explicit "rebuild it all" mode — is allowed to replace it.
      const coverLocked = prevSourcesAll.coverManual === true && mode !== 'redo'

      // Cover: only (re)download when overwriting, or when the game has no cover.
      // In fill mode an existing coverPath is left untouched.
      let coverPath: string | undefined
      const needCover = !coverLocked && (!fillOnly || (isEmpty(game.coverPath) && isEmpty(game.coverUrl)))
      if (withCovers && meta.coverUrl && needCover) {
        try {
          coverPath = await downloadAndCacheCover(meta.coverUrl, game.platform.slug, game.id)
        } catch { /* cover download failure is non-fatal */ }
      }

      // YouTube trailer (skipped once the API errors; in fill, only if missing).
      let trailerUrl: string | undefined
      let trailerFound = false
      if (withTrailers && !youtubeDisabled && (!fillOnly || isEmpty(game.trailerUrl))) {
        try {
          const url = await searchYouTubeTrailer(meta.title)
          if (url) { trailerUrl = url; trailerFound = true }
        } catch (err) {
          if (err instanceof YouTubeApiError) youtubeDisabled = true
        }
        await delay(rateMs)
        if (signal.aborted) break
      }

      // Score. No metadata provider carries one, so it has its own chain (RAWG
      // metacritic → Metacritic → LaunchBox community rating). Resolving it here
      // is what makes a scanned game arrive with its score already filled in;
      // the dedicated score modes remain for backfilling an existing library.
      // Only for games that don't have one — 'redo' re-derives everything.
      let scoreData: { rawgScore?: number; scoreSource?: string; rawgMetacritic?: number } = {}
      if (withScores && (mode === 'redo' || game.rawgScore == null)) {
        const r = await fetchGameScore({
          title:        meta.title || game.title,
          platformSlug: game.platform.slug,
          rawgId:       meta.rawgId ?? game.rawgId,
          rateMs,
          apiKey,
        }).catch(() => null)
        if (r) {
          scoreData = {
            rawgScore:   r.score,
            scoreSource: r.source,
            // Only a critic metascore belongs in rawgMetacritic — a LaunchBox
            // community rating is a user score and must not be mislabelled.
            ...(r.isCritic ? { rawgMetacritic: r.score } : {}),
          }
        }
        if (signal.aborted) break
      }

      const screenshotsJson = meta.screenshots.length > 0 ? JSON.stringify(meta.screenshots) : undefined

      // Build the update: fill = only currently-empty fields; otherwise overwrite all.
      const data = fillOnly
        ? {
            ...(isEmpty(game.description)     && meta.description         && { description: meta.description }),
            ...(isEmpty(game.releaseYear)     && meta.releaseYear != null && { releaseYear: meta.releaseYear }),
            ...(isEmpty(game.genre)           && meta.genre               && { genre: meta.genre }),
            ...(isEmpty(game.developer)       && meta.developer           && { developer: meta.developer }),
            ...(isEmpty(game.publisher)       && meta.publisher           && { publisher: meta.publisher }),
            ...(!coverLocked && isEmpty(game.coverUrl) && meta.coverUrl    && { coverUrl: meta.coverUrl }),
            ...(isEmpty(game.screenshotPaths) && screenshotsJson          && { screenshotPaths: screenshotsJson }),
            ...(game.rawgId == null && meta.rawgId != null && { rawgId: meta.rawgId }),
            ...(!game.rawgSlug && meta.rawgSlug && { rawgSlug: meta.rawgSlug }),
            ...(coverPath  && { coverPath }),   // only set when needCover was true
            ...(trailerUrl && { trailerUrl }),
          }
        : {
            title:       meta.title,
            description: meta.description,
            releaseYear: meta.releaseYear,
            genre:       meta.genre,
            developer:   meta.developer,
            publisher:   meta.publisher,
            ...(coverLocked ? {} : { coverUrl: meta.coverUrl }),
            ...(screenshotsJson && { screenshotPaths: screenshotsJson }),
            ...(meta.rawgId   != null && { rawgId: meta.rawgId }),
            ...(meta.rawgSlug && { rawgSlug: meta.rawgSlug }),
            ...(coverPath  && { coverPath }),
            ...(trailerUrl && { trailerUrl }),
          }

      // Provenance: in fill, merge new sources over the previous record so a
      // field we didn't touch keeps its old source badge.
      const prevSources: MetadataSources = fillOnly ? prevSourcesAll : {}
      // Only attribute sources for fields we actually wrote in fill mode.
      const writtenSources = fillOnly
        ? Object.fromEntries(
            Object.entries(meta.sources).filter(([k]) => {
              if (k === 'cover')       return 'coverUrl' in data || 'coverPath' in data
              if (k === 'description') return 'description' in data
              if (k === 'screenshots') return 'screenshotPaths' in data
              if (k === 'info')        return ['genre', 'developer', 'publisher', 'releaseYear'].some(f => f in data)
              return false
            }),
          )
        : meta.sources
      const merged: MetadataSources = { ...prevSources, ...writtenSources }
      // The lock also protects the badge: we didn't touch the image, so the
      // hand-picked provenance stays instead of being relabelled as the
      // provider's, which is what it would look like otherwise.
      if (coverLocked) {
        if (prevSourcesAll.cover) merged.cover = prevSourcesAll.cover
        else delete merged.cover
        merged.coverManual = true
      }
      const metadataSources = JSON.stringify(merged)

      // In fill mode, if nothing was actually empty, don't write (and don't bump
      // metadataFetchedAt) — count it as skipped so we don't churn existing data.
      if (fillOnly && Object.keys(data).length === 0 && Object.keys(scoreData).length === 0) {
        skipped++
        emit({ type: 'skipped', gameId: game.id, title: game.title, reason: 'nothing_to_fill', processed, total, applied, skipped, failed })
        continue
      }

      await db.game.update({
        where: { id: game.id },
        data: {
          ...data,
          ...scoreData,
          metadataSources,
          // Only stamp the marker when actual metadata arrived. A cover-only
          // result — the rescue for games no provider has heard of, which returns
          // a box and nothing else — would otherwise mark the game as "done" and
          // drop it out of the pending count with no description, year or genre
          // to show for it.
          ...(meta.sources.info ? { metadataFetchedAt: new Date() } : {}),
        },
      })

      applied++
      emit({ type: 'applied', gameId: game.id, title: game.title, matchedTitle: meta.title, confidence: meta.confidence, trailerFound, score: scoreData.rawgScore, processed, total, applied, skipped, failed })

    } catch (err) {
      failed++
      const reason = err instanceof Error ? err.message : 'unknown_error'
      emit({ type: 'failed', gameId: game.id, title: game.title, reason, processed, total, applied, skipped, failed })
    }
  }

  emit({ type: 'done', total, processed: Math.min(games.length, total), applied, skipped, failed })
}
