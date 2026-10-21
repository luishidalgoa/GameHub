import { RAWG_PLATFORM_SLUGS } from './rawg'
import { fileToTitle } from '@/lib/utils'
import type { MetadataResult } from './provider'

// Confidence thresholds (max 100):
//   >= AUTO_THRESHOLD → apply automatically; below it the match is not used
export const AUTO_THRESHOLD   = 68

const ROMAN: Record<string, string> = {
  i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10',
  xi: '11', xii: '12', xiii: '13', xiv: '14', xv: '15', xvi: '16', xvii: '17', xviii: '18', xix: '19', xx: '20',
}

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accent marks (é → e)
    .toLowerCase()
    .replace(/['’`]/g, '')        // "Kirby's" and "Kirbys" are the same word
    .replace(/&/g, ' and ')       // "Ratchet & Clank" and "Ratchet and Clank"
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // "Final Fantasy VII" and "Final Fantasy 7" are the same game (#114).
    .split(' ')
    .map(tok => ROMAN[tok] ?? tok)
    .join(' ')
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
  let score = jaccard(fileToTitle(gameTitle), candidateTitle) * 50
  if (normalize(fileToTitle(gameTitle)) === normalize(candidateTitle)) score += 20
  if (platformMatched) score += 30
  return Math.min(100, Math.round(score))
}

/**
 * RAWG confidence — platform verified via RAWG platform SLUGS.
 *
 * Crucially, when we KNOW the expected RAWG slug for this library platform and
 * the candidate is NOT available on it, the candidate is REJECTED (score 0).
 * Previously a wrong-platform game with an identical title still scored
 * jaccard(50)+exact(20)=70 ≥ AUTO_THRESHOLD and got auto-applied — that's how a
 * Game Boy cover landed on a SNES entry. We only reject when we have a mapping
 * AND the candidate reports platforms; otherwise we fall back to title scoring
 * so unmapped platforms still work (just without the platform guarantee).
 */
export function calcConfidence(
  gameTitle: string,
  platformSlug: string,
  result: MetadataResult,
): number {
  const expectedSlug = RAWG_PLATFORM_SLUGS[platformSlug]
  const candidateSlugs = result.platformSlugs ?? []
  if (expectedSlug && candidateSlugs.length > 0) {
    if (!candidateSlugs.includes(expectedSlug)) return 0   // wrong console → discard
    return calcTitleConfidence(gameTitle, result.title, true)
  }
  // No reliable platform info — score on title alone (no platform bonus).
  return calcTitleConfidence(gameTitle, result.title, false)
}
