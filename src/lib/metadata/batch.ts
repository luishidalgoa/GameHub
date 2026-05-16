import { db } from '@/lib/db'
import { downloadAndCacheCover } from '@/lib/covers'
import { getRawgProvider, cleanTitle, RAWG_PLATFORM_IDS } from './rawg'
import type { MetadataResult } from './provider'

// ── Confidence thresholds ────────────────────────────────────────────────────
// Score breakdown (max 100):
//   Title similarity  — Jaccard over normalized tokens    0–50 pts
//   Exact title bonus — titles identical after normalize  +20 pts
//   Platform match    — RAWG result includes our platform +30 pts
//
// >= AUTO_THRESHOLD  → apply automatically
// >= REVIEW_THRESHOLD → skip but include in manual-review list
// <  REVIEW_THRESHOLD → discard silently (too different)
export const AUTO_THRESHOLD   = 68
export const REVIEW_THRESHOLD = 40

export type BatchEventType = 'start' | 'applied' | 'skipped' | 'failed' | 'done'

export interface BatchEvent {
  type:         BatchEventType
  gameId?:      number
  title?:       string           // our DB title (cleaned)
  matchedTitle?: string          // RAWG title that was accepted/considered
  confidence?:  number           // 0-100
  reason?:      string           // why it was skipped/failed
  processed?:   number
  total?:       number
  applied?:     number
  skipped?:     number
  failed?:      number
}

// ── Text normalization ────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .normalize('NFD')               // decompose accented chars
    .replace(/[̀-ͯ]/g, '') // strip accent marks  (é → e)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')   // strip punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Jaccard similarity on token sets ─────────────────────────────────────────

function jaccard(a: string, b: string): number {
  const tokens = (s: string) => new Set(normalize(s).split(' ').filter(Boolean))
  const setA   = tokens(a)
  const setB   = tokens(b)
  const intersection = [...setA].filter(t => setB.has(t)).length
  const union        = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : intersection / union
}

// ── Confidence score ──────────────────────────────────────────────────────────

export function calcConfidence(
  gameTitle:    string,
  platformSlug: string,
  result:       MetadataResult,
): number {
  let score = 0

  // 1. Title similarity (0–50 pts)
  const sim = jaccard(cleanTitle(gameTitle), result.title)
  score += sim * 50

  // 2. Exact title bonus (+20 pts)
  if (normalize(cleanTitle(gameTitle)) === normalize(result.title)) {
    score += 20
  }

  // 3. Platform verification (+30 pts)
  const expectedId = RAWG_PLATFORM_IDS[platformSlug]
  if (expectedId && result.platformIds?.includes(expectedId)) {
    score += 30
  }

  return Math.min(100, Math.round(score))
}

// ── Delay helper ──────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── Main batch processor ──────────────────────────────────────────────────────

export async function runMetadataBatch(opts: {
  emit:        (event: BatchEvent) => void
  signal:      AbortSignal
  withCovers?: boolean           // also download cover art (default: true)
  rateMs?:     number            // ms between RAWG requests (default: 350)
}) {
  const { emit, signal, withCovers = true, rateMs = 350 } = opts

  const provider = getRawgProvider()
  if (!provider) {
    emit({ type: 'failed', reason: 'RAWG_API_KEY not configured' })
    emit({ type: 'done', total: 0, processed: 0, applied: 0, skipped: 0, failed: 1 })
    return
  }

  // Fetch all games without metadata, including their platform
  const games = await db.game.findMany({
    where:   { isHidden: false, metadataFetchedAt: null },
    include: { platform: true },
    orderBy: { title: 'asc' },
  })

  const total = games.length
  emit({ type: 'start', total })

  let applied = 0, skipped = 0, failed = 0

  for (let i = 0; i < games.length; i++) {
    if (signal.aborted) break

    const game = games[i]
    const processed = i + 1

    try {
      // ── 1. Search RAWG ────────────────────────────────────────────────────
      await delay(rateMs)
      if (signal.aborted) break

      const results = await provider.search(game.title, game.platform.slug)

      if (results.length === 0) {
        skipped++
        emit({ type: 'skipped', gameId: game.id, title: game.title, reason: 'no_results', processed, total, applied, skipped, failed })
        continue
      }

      // ── 2. Score every result, pick the best ─────────────────────────────
      const scored = results
        .map(r => ({ ...r, confidence: calcConfidence(game.title, game.platform.slug, r) }))
        .sort((a, b) => b.confidence - a.confidence)

      const best = scored[0]

      if (best.confidence < REVIEW_THRESHOLD) {
        skipped++
        emit({ type: 'skipped', gameId: game.id, title: game.title, matchedTitle: best.title, confidence: best.confidence, reason: 'low_confidence', processed, total, applied, skipped, failed })
        continue
      }

      if (best.confidence < AUTO_THRESHOLD) {
        skipped++
        emit({ type: 'skipped', gameId: game.id, title: game.title, matchedTitle: best.title, confidence: best.confidence, reason: 'uncertain', processed, total, applied, skipped, failed })
        continue
      }

      // ── 3. Fetch full details ─────────────────────────────────────────────
      await delay(rateMs)
      if (signal.aborted) break

      const meta = await provider.fetchById(best.id)
      if (!meta) {
        failed++
        emit({ type: 'failed', gameId: game.id, title: game.title, reason: 'fetch_failed', processed, total, applied, skipped, failed })
        continue
      }

      // ── 4. Optionally download cover ──────────────────────────────────────
      let coverPath: string | undefined
      if (withCovers && meta.coverUrl) {
        try {
          coverPath = await downloadAndCacheCover(meta.coverUrl, game.platform.slug, game.id)
        } catch { /* cover download failure is non-fatal */ }
      }

      // ── 5. Persist to DB ──────────────────────────────────────────────────
      await db.game.update({
        where: { id: game.id },
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
          ...(coverPath && { coverPath }),
          metadataFetchedAt: new Date(),
        },
      })

      applied++
      emit({ type: 'applied', gameId: game.id, title: game.title, matchedTitle: meta.title, confidence: best.confidence, processed, total, applied, skipped, failed })

    } catch (err) {
      failed++
      const reason = err instanceof Error ? err.message : 'unknown_error'
      emit({ type: 'failed', gameId: game.id, title: game.title, reason, processed, total, applied, skipped, failed })
    }
  }

  emit({ type: 'done', total, processed: Math.min(games.length, total), applied, skipped, failed })
}
