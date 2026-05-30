import { db } from '@/lib/db'
import { downloadAndCacheCover } from '@/lib/covers'
import { getRawgProvider } from './rawg'
import { searchYouTubeTrailer, YouTubeApiError } from '@/lib/youtube'
import { AUTO_THRESHOLD } from './scoring'
import { getProviderMatrix } from './matrix'
import { gatherMetadata } from './compose'

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
}

// ── Delay helper ──────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── Main batch processor ──────────────────────────────────────────────────────

export async function runMetadataBatch(opts: {
  emit:             (event: BatchEvent) => void
  signal:           AbortSignal
  withCovers?:      boolean
  withTrailers?:    boolean
  /** Also backfill trailers for games that ALREADY have metadata but no trailer
   *  (without touching their metadata). Used by the admin "Auto Metadata Fetch". */
  backfillTrailers?: boolean
  rateMs?:          number
  apiKey?:          string
}) {
  const { emit, signal, withCovers = true, withTrailers = false, backfillTrailers = false, rateMs = 350, apiKey } = opts

  // Per-field provider matrix (LaunchBox / RAWG / SteamGridDB per category).
  const matrix = await getProviderMatrix()

  // RAWG is optional: if a field is set to RAWG but no key is configured, the
  // composer falls back to LaunchBox for that field. We only hard-fail if RAWG
  // is the ONLY possible source AND it's unavailable — i.e. nothing else can
  // produce data (no LaunchBox field selected and no RAWG key).
  const usesAnyLaunchBox =
    matrix.cover === 'launchbox' || matrix.info === 'launchbox' ||
    matrix.description === 'launchbox' || matrix.screenshots === 'launchbox'
  const usesAnyRawg =
    matrix.cover === 'rawg' || matrix.info === 'rawg' ||
    matrix.description === 'rawg' || matrix.screenshots === 'rawg'
  if (!usesAnyLaunchBox && usesAnyRawg && !getRawgProvider(apiKey)) {
    emit({ type: 'failed', reason: 'RAWG API key not configured' })
    emit({ type: 'done', total: 0, processed: 0, applied: 0, skipped: 0, failed: 1 })
    return
  }

  // Games missing metadata, plus (optionally) games that have metadata but no
  // trailer yet — those only get a trailer backfilled, their metadata is left
  // untouched.
  const games = await db.game.findMany({
    where: {
      isHidden: false,
      OR: [
        { metadataFetchedAt: null },
        ...(withTrailers && backfillTrailers ? [{ trailerUrl: null }] : []),
      ],
    },
    include: { platform: true },
    orderBy: { title: 'asc' },
  })

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

    // ── Trailer-only backfill: game already has metadata, just needs a trailer ─
    if (game.metadataFetchedAt !== null) {
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
        matrix,
        rawgApiKey:   apiKey,
        threshold:    AUTO_THRESHOLD,
      })

      if (!meta) {
        skipped++
        emit({ type: 'skipped', gameId: game.id, title: game.title, reason: 'no_match', processed, total, applied, skipped, failed })
        continue
      }

      // Cover: download the composed cover URL and cache to S3.
      let coverPath: string | undefined
      if (withCovers && meta.coverUrl) {
        try {
          coverPath = await downloadAndCacheCover(meta.coverUrl, game.platform.slug, game.id)
        } catch { /* cover download failure is non-fatal */ }
      }

      // YouTube trailer (skipped once the API has errored this run).
      let trailerUrl: string | undefined
      let trailerFound = false
      if (withTrailers && !youtubeDisabled) {
        try {
          const url = await searchYouTubeTrailer(meta.title)
          if (url) { trailerUrl = url; trailerFound = true }
        } catch (err) {
          if (err instanceof YouTubeApiError) youtubeDisabled = true
        }
        await delay(rateMs)
        if (signal.aborted) break
      }

      // Persist.
      await db.game.update({
        where: { id: game.id },
        data: {
          title:             meta.title,
          description:       meta.description,
          releaseYear:       meta.releaseYear,
          genre:             meta.genre,
          developer:         meta.developer,
          publisher:         meta.publisher,
          coverUrl:          meta.coverUrl,
          ...(meta.screenshots.length > 0 && { screenshotPaths: JSON.stringify(meta.screenshots) }),
          ...(meta.rawgId   != null && { rawgId: meta.rawgId }),
          ...(meta.rawgSlug && { rawgSlug: meta.rawgSlug }),
          ...(coverPath  && { coverPath }),
          ...(trailerUrl && { trailerUrl }),
          metadataFetchedAt: new Date(),
        },
      })

      applied++
      emit({ type: 'applied', gameId: game.id, title: game.title, matchedTitle: meta.title, confidence: meta.confidence, trailerFound, processed, total, applied, skipped, failed })

    } catch (err) {
      failed++
      const reason = err instanceof Error ? err.message : 'unknown_error'
      emit({ type: 'failed', gameId: game.id, title: game.title, reason, processed, total, applied, skipped, failed })
    }
  }

  emit({ type: 'done', total, processed: Math.min(games.length, total), applied, skipped, failed })
}
