import type { MetadataProvider, MetadataResult } from './provider'

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

/**
 * Strip ROM-naming artifacts before sending to RAWG.
 * Handles Switch TitleIDs in [], region codes (USA/EUR/JPN), Rev markers, etc.
 */
export function cleanTitle(raw: string): string {
  return raw
    .replace(/\[[^\]]*\]/g, '')
    .replace(
      /\(\s*(?:USA|EUR|JPN|JAP|PAL|NTSC-[JUE]|NTSC|Rev\s?\d+|v[\d.]+|Disc\s?\d+|Beta|Demo|Proto(?:type)?|Sample|Kiosk|eShop|Virtual Console|En(?:[,+]\w+)*|[A-Z][a-z](?:[,+][A-Z][a-z])*)\s*\)/gi,
      ''
    )
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
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
  platforms?: RawgPlatformEntry[]
}

interface RawgSearchResponse {
  results: RawgGame[]
}

export class RawgProvider implements MetadataProvider {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async search(title: string, _platform: string, overrideQuery?: string): Promise<MetadataResult[]> {
    const query = overrideQuery ?? cleanTitle(title)
    return this._doSearch(query)
  }

  private async _doSearch(query: string): Promise<MetadataResult[]> {
    const params = new URLSearchParams({
      key:            this.apiKey,
      search:         query,
      page_size:      '10',
      search_precise: 'false',
    })

    const res = await fetch(`${RAWG_BASE}/games?${params}`)
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
    const res = await fetch(`${RAWG_BASE}/games/${slug}/screenshots?key=${this.apiKey}&page_size=12`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).map((s: { image: string }) => s.image)
  }

  // Accepts either a numeric RAWG ID or a slug string (e.g. "pokemon-x")
  async fetchById(id: number | string): Promise<MetadataResult | null> {
    const res = await fetch(`${RAWG_BASE}/games/${id}?key=${this.apiKey}`)
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
