import { getRawgProvider } from './rawg'
import { fetchGameScore } from './scoreChain'
import { unifiedScore } from './popularity'
import type { RawgPopularityMetrics } from './rawg'

/**
 * The score the scores batch would write for one game, so the one-click fill
 * and the batch agree on the scale and the label (#80). Returns null when no
 * source has a score. Never throws: a score miss must not fail the fill.
 */
export async function scoreForGame(
  game: { title: string; platformSlug: string; rawgId: number | null },
  apiKey: string | undefined,
  rateMs = 350,
  /** Metrics the caller already fetched for this game (the popularity pass): not fetched twice. */
  preloaded?: RawgPopularityMetrics | null,
): Promise<{ rawgScore: number; scoreSource: string; rawgMetacritic: number | null; rawgRating: number | null; rawgAdded: number | null } | null> {
  try {
    const provider = getRawgProvider(apiKey)
    const m = preloaded !== undefined
      ? preloaded
      : game.rawgId != null && provider ? await provider.fetchPopularity(game.rawgId) : null

    let metacritic = m?.metacritic ?? null
    let score = m ? unifiedScore({ rawgMetacritic: m.metacritic, rawgRating: m.rating }) : null
    let source: string | null = metacritic != null ? 'metacritic' : (score != null ? 'rawg_rating' : null)

    if (metacritic == null) {
      const r = await fetchGameScore({
        title: game.title, platformSlug: game.platformSlug,
        rawgMetacritic: m?.metacritic ?? null, rateMs, apiKey,
      })
      if (r) {
        score = r.score
        source = r.source
        if (r.isCritic) metacritic = r.score
      }
    }

    if (score == null || source == null) return null
    return {
      rawgScore: score,
      scoreSource: source,
      rawgMetacritic: metacritic,
      rawgRating: m?.rating ?? null,
      rawgAdded: m?.added ?? null,
    }
  } catch {
    return null
  }
}
