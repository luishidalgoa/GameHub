import { fileToTitle } from '@/lib/utils'
import type { MetadataProvider, MetadataResult } from './provider'
import { providerFetch } from './http'

const RAWG_BASE = 'https://api.rawg.io/api'

// Map a GameHub platform slug → the platform SLUG RAWG uses (verified against
// rawg.io/platforms). Slugs are stable and self-documenting, unlike the numeric
// ids we used before (which were partly wrong and lacked SNES). Used by the
// confidence scorer to REJECT candidates from the wrong console (so e.g. a Game
// Boy game can't be auto-applied to a SNES library entry). Keys cover both short
// aliases and the long display-name slugs a user might create.
export const RAWG_PLATFORM_SLUGS: Record<string, string> = {
  switch:   'nintendo-switch',
  '3ds':    'nintendo-3ds',
  nds:      'nintendo-ds',
  wii:      'wii',
  wiiu:     'wii-u',
  gamecube: 'gamecube',
  n64:      'nintendo-64',
  snes:                                   'snes',
  'super-nintendo-entertainment-system':  'snes',
  'super-nintendo':                       'snes',
  sfc:                                    'snes',
  nes:      'nes',
  gba:      'game-boy-advance',
  gb:       'game-boy',
  gbc:      'game-boy-color',
  psp:      'psp',
  psvita:        'ps-vita',
  'psvita-ports':'ps-vita',
  ps1:      'playstation1',
  ps2:      'playstation2',
  ps3:      'playstation3',
  pc:       'pc',
}

interface RawgPlatformEntry {
  platform: { id: number; name: string; slug: string }
}

interface RawgGame {
  id: number
  slug: string
  name: string
  description_raw?: string
  released?: string
  background_image?: string
  genres?: { name: string }[]
  developers?: { name: string }[]
  publishers?: { name: string }[]
  rating?: number
  ratings_count?: number
  added?: number
  metacritic?: number | null
  platforms?: RawgPlatformEntry[]
}

interface RawgSearchResponse {
  results: RawgGame[]
}

export interface RawgScoreCandidate {
  name: string
  releaseYear: number | null
  platforms: string[]
  metacritic: number | null
}

/** Objective popularity/quality signals for a single RAWG game. */
export interface RawgPopularityMetrics {
  added:        number | null   // # of users who own/added it — popularity
  rating:       number | null   // 0–5
  ratingsCount: number | null   // vote count (confidence)
  metacritic:   number | null   // 0–100, often null for retro
}

export class RawgProvider implements MetadataProvider {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async search(title: string, _platform: string, overrideQuery?: string): Promise<MetadataResult[]> {
    const query = overrideQuery ?? fileToTitle(title)
    return this._doSearch(query)
  }

  private async _doSearch(query: string): Promise<MetadataResult[]> {
    const params = new URLSearchParams({
      key:            this.apiKey,
      search:         query,
      page_size:      '10',
      search_precise: 'false',
    })

    const res = await providerFetch(`${RAWG_BASE}/games?${params}`)
    if (!res.ok) throw new Error(`RAWG search failed: ${res.status}`)

    const data: RawgSearchResponse = await res.json()
    return data.results.map((g) => ({
      id:          g.id,
      slug:        g.slug,
      title:       g.name,
      releaseYear: g.released ? new Date(g.released).getFullYear() : undefined,
      coverUrl:    g.background_image ?? undefined,
      source:      'rawg' as const,
      // Include platform IDs + slugs so the confidence scorer can verify the match
      platformIds:   g.platforms?.map((p) => p.platform.id) ?? [],
      platformSlugs: g.platforms?.map((p) => p.platform.slug) ?? [],
    }))
  }

  async fetchScreenshots(slug: string): Promise<string[]> {
    const res = await providerFetch(`${RAWG_BASE}/games/${slug}/screenshots?key=${this.apiKey}&page_size=12`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).map((s: { image: string }) => s.image)
  }

  /**
   * Candidates for the manual score box: the same search as `search`, but it
   * keeps the critic score that `search` drops, and the platform names so the
   * admin can tell two games with the same title apart.
   */
  async searchScores(query: string): Promise<RawgScoreCandidate[]> {
    const params = new URLSearchParams({
      key:            this.apiKey,
      search:         query,
      page_size:      '10',
      search_precise: 'false',
    })
    const res = await providerFetch(`${RAWG_BASE}/games?${params}`)
    if (!res.ok) throw new Error(`RAWG search failed: ${res.status}`)
    const data: RawgSearchResponse = await res.json()
    return data.results.map((g) => ({
      name:        g.name,
      releaseYear: g.released ? new Date(g.released).getFullYear() : null,
      platforms:   g.platforms?.map((p) => p.platform.name) ?? [],
      metacritic:  g.metacritic ?? null,
    }))
  }

  /**
   * Fetch just the popularity/quality metrics for a game (by numeric id or slug).
   * Same GET /games/{id} endpoint as fetchById, but returns only the objective
   * signals used to rank per-platform recommendations — kept separate from
   * MetadataResult (the cross-provider composition shape) to stay decoupled.
   */
  async fetchPopularity(id: number | string): Promise<RawgPopularityMetrics | null> {
    const res = await providerFetch(`${RAWG_BASE}/games/${id}?key=${this.apiKey}`)
    if (!res.ok) return null
    const g: RawgGame = await res.json()
    return {
      added:        g.added        ?? null,
      rating:       g.rating       ?? null,
      ratingsCount: g.ratings_count ?? null,
      metacritic:   g.metacritic   ?? null,
    }
  }

  // Accepts either a numeric RAWG ID or a slug string (e.g. "pokemon-x")
  async fetchById(id: number | string): Promise<MetadataResult | null> {
    const res = await providerFetch(`${RAWG_BASE}/games/${id}?key=${this.apiKey}`)
    if (!res.ok) return null

    const g: RawgGame = await res.json()
    return {
      id:          g.id,
      slug:        g.slug,
      title:       g.name,
      description: g.description_raw,
      releaseYear: g.released ? new Date(g.released).getFullYear() : undefined,
      genre:       g.genres?.map((x) => x.name).join(', '),
      developer:   g.developers?.map((x) => x.name).join(', '),
      publisher:   g.publishers?.map((x) => x.name).join(', '),
      coverUrl:    g.background_image ?? undefined,
      rating:      g.rating,
      source:      'rawg',
      platformIds:   g.platforms?.map((p) => p.platform.id) ?? [],
      platformSlugs: g.platforms?.map((p) => p.platform.slug) ?? [],
    }
  }
}

export function getRawgProvider(apiKey?: string): RawgProvider | null {
  const key = apiKey ?? process.env.RAWG_API_KEY
  if (!key) return null
  return new RawgProvider(key)
}
