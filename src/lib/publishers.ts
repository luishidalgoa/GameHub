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

/** A company as the ranking reads it: its key, its name, and the company it belongs to. */
export interface RankCompany {
  id: number
  key: string
  name: string
  parentId: number | null
}

/** What one company's own games add up to. */
export interface RankTotals {
  companyId: number
  games: number
  /** How many of its games have a score. */
  rated: number
  /** Sum of the scores: more good games weigh more. */
  weight: number
}

/** A tile on the home page: one owning company and every company that belongs to it. */
export interface RankedPublisher {
  /** The key of the company at the top of the group. */
  key: string
  name: string
  /** The owning company and every company below it. */
  companyIds: number[]
  /** Their keys: the owner's first, then the rest by games. Art saved under an old key still counts. */
  keys: string[]
  games: number
  weight: number
}

/**
 * Groups by owner (#143): each company counts toward the company at the top of its owners.
 * Ordered by the weight of the games' scores. A group needs `minRated` scored games to show.
 */
export function rankGroups(companies: RankCompany[], totals: RankTotals[], minRated = 3): RankedPublisher[] {
  const byId = new Map(companies.map(c => [c.id, c]))
  const topOf = (id: number): RankCompany | undefined => {
    let current = byId.get(id)
    const seen = new Set<number>()
    while (current && current.parentId !== null && !seen.has(current.id)) {
      seen.add(current.id)
      const owner = byId.get(current.parentId)
      if (!owner) break
      current = owner
    }
    return current
  }

  const groups = new Map<number, { top: RankCompany; members: RankTotals[]; games: number; rated: number; weight: number }>()
  for (const t of totals) {
    const top = topOf(t.companyId)
    if (!top) continue
    const g = groups.get(top.id) ?? { top, members: [], games: 0, rated: 0, weight: 0 }
    g.members.push(t)
    g.games += t.games
    g.rated += t.rated
    g.weight += t.weight
    groups.set(top.id, g)
  }

  return [...groups.values()]
    .filter(g => g.rated >= minRated)
    .map(g => {
      const byGames = [...g.members].sort((a, b) => b.games - a.games)
      const keys = [...new Set([g.top.key, ...byGames.map(m => byId.get(m.companyId)?.key).filter((k): k is string => !!k)])]
      return {
        key: g.top.key, name: g.top.name, companyIds: g.members.map(m => m.companyId), keys,
        games: g.games, weight: Math.round(g.weight),
      }
    })
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name))
}
