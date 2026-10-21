/**
 * Publishers as the home page ranks them. LaunchBox and RAWG spell the same
 * company many ways ("Ubisoft", "Ubi Soft Entertainment Software", "Ubisoft
 * Entertainment"), so names are grouped by a normalized key before counting.
 */

// Words that only say what kind of company it is, not which one.
const COMPANY_NOISE = new Set([
  'inc', 'incorporated', 'co', 'ltd', 'llc', 'corp', 'corporation', 'gmbh', 'sa', 'ab', 'bv', 'plc',
  'entertainment', 'publishing', 'software', 'interactive', 'games', 'game', 'sales', 'home',
  'international', 'europe', 'usa', 'us', 'america', 'of', 'the', 'and',
])

// Known spellings that no suffix rule folds together.
const ALIASES: Record<string, string> = {
  'ubi soft': 'ubisoft',
  'electronic arts': 'ea',
  'ea games': 'ea',
  'sony computer': 'sony',
  'sony interactive': 'sony',
  'nintendo of': 'nintendo',
  'buena vista': 'disney',
  'disney': 'disney',
}

export function publisherKey(name: string): string {
  const words = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !COMPANY_NOISE.has(w))
  const key = words.join(' ')
  return ALIASES[key] ?? key
}

export interface PublisherGame {
  publisher: string | null
  /** 0-100 unified score, when the game has one. */
  score: number | null
}

export interface RankedPublisher {
  key: string
  /** The spelling most of its games use. */
  name: string
  /** Every spelling in the library, to find the group's games. */
  spellings: string[]
  games: number
  /** Sum of the scores of its rated games: more good games weigh more. */
  weight: number
}

/** Publishers ordered by the weight of their games' ratings. */
export function rankPublishers(games: PublisherGame[], minRated = 3): RankedPublisher[] {
  const groups = new Map<string, { spellings: Map<string, number>; games: number; rated: number; weight: number }>()
  for (const g of games) {
    const raw = g.publisher?.trim()
    if (!raw) continue
    const key = publisherKey(raw)
    if (!key) continue
    const e = groups.get(key) ?? { spellings: new Map(), games: 0, rated: 0, weight: 0 }
    e.games++
    e.spellings.set(raw, (e.spellings.get(raw) ?? 0) + 1)
    if (g.score != null) { e.rated++; e.weight += g.score }
    groups.set(key, e)
  }
  return [...groups.entries()]
    .filter(([, e]) => e.rated >= minRated)
    .map(([key, e]) => ({
      key,
      name: [...e.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0],
      spellings: [...e.spellings.keys()],
      games: e.games,
      weight: Math.round(e.weight),
    }))
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name))
}
