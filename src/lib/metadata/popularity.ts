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
