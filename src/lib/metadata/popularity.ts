// Objective popularity scoring for per-platform game recommendations.
//
// The score blends popularity (how many RAWG users own the game) with quality
// (rating, metacritic). It is computed at QUERY TIME from the raw metrics stored
// on the Game row — never precomputed/stored — so the formula can be tuned
// without re-syncing from RAWG.
//
// Design for a RETRO library: `added` is the reliable, always-present signal;
// rating/metacritic are frequently null for SNES/GBA titles, so their absence
// must never penalize a game. When no quality signal exists, the score collapses
// to pure log-popularity — exactly what we want for retro.

/** Reference value at which log-popularity saturates to ~1.0. */
export const ADDED_REF = 10_000
/** Weight split between popularity and quality when quality is present. */
export const W_POP = 0.7
export const W_QUAL = 0.3
/** Confidence floor: a game needs at least this many `added` to be eligible.
 *  Floored on `added` (not ratings_count) because retro games have real owners
 *  but few votes. Prevents a 1-vote obscurity from topping the list. */
export const MIN_ADDED = 50

/** "Hidden gems": well-rated but not widely owned. */
export const GEM_MAX_ADDED = 800   // below the popular crowd
export const GEM_MIN_RATING = 4    // genuinely good (0–5 scale)

export interface PopularityMetrics {
  rawgAdded:        number | null
  rawgRating:       number | null
  rawgMetacritic:   number | null
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/**
 * Weighted 0–1 popularity score. Returns 0 when there's no `added` signal.
 * `added` → log-compressed (heavy-tailed); quality = avg of the present signals.
 */
export function computePopularityScore(m: PopularityMetrics): number {
  const added = m.rawgAdded ?? 0
  const popPart = clamp01(Math.log10(added + 1) / Math.log10(ADDED_REF + 1))

  const parts: number[] = []
  if (m.rawgRating != null)     parts.push(clamp01(m.rawgRating / 5))
  if (m.rawgMetacritic != null) parts.push(clamp01(m.rawgMetacritic / 100))
  const qualityPart = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null

  return qualityPart != null ? W_POP * popPart + W_QUAL * qualityPart : popPart
}

/** Comparator: highest score first, then most-owned, then stable by id. */
export function comparePopularity<T extends PopularityMetrics & { id: number }>(a: T, b: T): number {
  const d = computePopularityScore(b) - computePopularityScore(a)
  if (d !== 0) return d
  const added = (b.rawgAdded ?? 0) - (a.rawgAdded ?? 0)
  if (added !== 0) return added
  return a.id - b.id
}

// ── Unified score (single 0–100 scale) ──────────────────────────────────────

/**
 * Collapse the two RAWG signals into ONE 0–100 score so the badge, the rating
 * filter and the rating sort all speak the same scale:
 *   - metacritic (already 0–100) when present, else
 *   - the user rating (0–5) mapped ×20  (4.1★ → 82).
 * Returns null when neither exists. Mirrors the SQL backfill in the migration.
 */
export function unifiedScore(m: { rawgMetacritic?: number | null; rawgRating?: number | null }): number | null {
  if (m.rawgMetacritic != null) return m.rawgMetacritic
  if (m.rawgRating != null && m.rawgRating > 0) return Math.round(m.rawgRating * 20)
  return null
}

// ── Rating badge ────────────────────────────────────────────────────────────
export type BadgeTone = 'green' | 'yellow' | 'gray'
export interface RatingBadge {
  value:  number          // 0–100, always the same scale
  source: 'meta' | 'user' // for the tooltip ("Metacritic" vs "Player rating")
  tone:   BadgeTone
}

/**
 * Badge for a game's score on a single 0–100 scale. Prefers a precomputed
 * rawgScore (stored), else derives from metacritic/rating. Returns null when
 * there's no score so cards stay clean. Single source of truth for all surfaces.
 */
export function ratingBadge(m: {
  rawgScore?:      number | null
  rawgMetacritic?: number | null
  rawgRating?:     number | null
}): RatingBadge | null {
  const value = m.rawgScore ?? unifiedScore(m)
  if (value == null) return null
  const source: 'meta' | 'user' = m.rawgMetacritic != null ? 'meta' : 'user'
  const tone: BadgeTone = value >= 75 ? 'green' : value >= 50 ? 'yellow' : 'gray'
  return { value, source, tone }
}
