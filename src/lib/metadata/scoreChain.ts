import { getRawgProvider } from './rawg'
import { fetchMetacriticScore } from './metacritic'
import { fetchLaunchBoxRating } from './launchbox'

// Centralized score-fetch chain, reused everywhere a game's score is resolved
// (popularity batch, the editor "find score" button, the bulk autocomplete job).
// Order of preference:
//   1. RAWG metacritic (critic score) — free if already fetched, else by rawgId
//   2. Metacritic scraper (critic score) — fills RAWG's gaps for niche/retro
//   3. LaunchBox community rating (USER score) — last resort
// `isCritic` distinguishes a critic metascore (RAWG/Metacritic) from a community
// rating (LaunchBox), so the caller stores provenance honestly and doesn't
// mislabel a community rating as a Metacritic.

export type ScoreSource = 'rawg' | 'metacritic' | 'launchbox'

export interface ScoreResult {
  score:    number       // 0–100
  source:   ScoreSource
  isCritic: boolean      // true for RAWG/Metacritic critic scores, false for LaunchBox community
}

export interface ScoreChainInput {
  title:           string
  platformSlug:    string
  rawgId?:         number | null
  /** A RAWG metacritic already fetched by the caller (skips re-querying RAWG). */
  rawgMetacritic?: number | null
  apiKey?:         string
  /** Pacing between source attempts (ms). */
  rateMs?:         number
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Resolve a single 0–100 score for a game, trying the sources in order and
 * returning the first hit. Returns null when no source has a score.
 */
export async function fetchGameScore(input: ScoreChainInput): Promise<ScoreResult | null> {
  const { title, platformSlug, rawgId, rawgMetacritic, apiKey, rateMs = 350 } = input

  // 1. RAWG metacritic (critic). Use a value already fetched, else look it up.
  if (rawgMetacritic != null) {
    return { score: rawgMetacritic, source: 'rawg', isCritic: true }
  }
  if (rawgId != null) {
    const provider = getRawgProvider(apiKey)
    if (provider) {
      try {
        const m = await provider.fetchPopularity(rawgId)
        if (m?.metacritic != null) return { score: m.metacritic, source: 'rawg', isCritic: true }
      } catch { /* fall through to scraper */ }
    }
  }

  // 2. Metacritic scraper (critic).
  await delay(rateMs)
  const mc = await fetchMetacriticScore(title, platformSlug)
  if (mc != null) return { score: mc, source: 'metacritic', isCritic: true }

  // 3. LaunchBox community rating (user score) — last resort.
  await delay(rateMs)
  const lb = await fetchLaunchBoxRating(title, platformSlug)
  if (lb != null) return { score: lb, source: 'launchbox', isCritic: false }

  return null
}
