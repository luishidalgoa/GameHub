import { cleanTitle, RAWG_PLATFORM_IDS } from './rawg'
import type { MetadataResult } from './provider'

// Confidence thresholds (max 100):
//   >= AUTO_THRESHOLD   → apply automatically
//   >= REVIEW_THRESHOLD → skip but eligible for manual review
//   <  REVIEW_THRESHOLD → discard (too different)
export const AUTO_THRESHOLD   = 68
export const REVIEW_THRESHOLD = 40

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accent marks (é → e)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function jaccard(a: string, b: string): number {
  const tokens = (s: string) => new Set(normalize(s).split(' ').filter(Boolean))
  const setA = tokens(a)
  const setB = tokens(b)
  const intersection = [...setA].filter(t => setB.has(t)).length
  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : intersection / union
}

/**
 * Generic title-based confidence:
 *   title similarity (0–50) + exact-title bonus (+20) + platform bonus (+30)
 */
export function calcTitleConfidence(
  gameTitle: string,
  candidateTitle: string,
  platformMatched: boolean,
): number {
  let score = jaccard(cleanTitle(gameTitle), candidateTitle) * 50
  if (normalize(cleanTitle(gameTitle)) === normalize(candidateTitle)) score += 20
  if (platformMatched) score += 30
  return Math.min(100, Math.round(score))
}

/** RAWG confidence — platform verified via RAWG numeric platform IDs. */
export function calcConfidence(
  gameTitle: string,
  platformSlug: string,
  result: MetadataResult,
): number {
  const expectedId = RAWG_PLATFORM_IDS[platformSlug]
  const platformMatched = Boolean(expectedId && result.platformIds?.includes(expectedId))
  return calcTitleConfidence(gameTitle, result.title, platformMatched)
}
