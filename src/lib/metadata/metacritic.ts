import { cleanTitle } from './rawg'

// Metacritic scraper — used ONLY as a fallback for the game score when RAWG
// doesn't expose a metacritic (RAWG aggregates Metacritic but has gaps for
// niche/retro titles). The metascore lives in a JSON-LD aggregateRating block,
// so we parse structured data, not fragile HTML regex.

const MC_SITE = 'https://www.metacritic.com'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

// GameHub platform slug → Metacritic platform path segment. Used to try the
// precise /game/<platform>/<slug>/ URL before the generic /game/<slug>/.
export const METACRITIC_PLATFORM_SLUGS: Record<string, string> = {
  switch:   'switch',
  wii:      'wii',
  wiiu:     'wii-u',
  gamecube: 'gamecube',
  n64:      'nintendo-64',
  '3ds':    '3ds',
  nds:      'ds',
  snes:                                  'super-nintendo',
  'super-nintendo-entertainment-system': 'super-nintendo',
  'super-nintendo':                      'super-nintendo',
  sfc:                                   'super-nintendo',
  nes:      'nes',
  gba:      'game-boy-advance',
  gbc:      'game-boy-color',
  gb:       'game-boy',
  psp:      'psp',
  psvita:        'playstation-vita',
  'psvita-ports':'playstation-vita',
  ps1:      'playstation',
  ps2:      'playstation-2',
  ps3:      'playstation-3',
  pc:       'pc',
}

const MC_BACKOFFS_MS = [0, 2000, 5000, 9000]

/**
 * Polite fetch of a Metacritic page. Mirrors LaunchBox's lbFetch:
 *   - browser UA + 25s abort timeout + exponential backoff on 429/5xx/network,
 *   - 404 → '' (the slug just doesn't exist; not an error).
 * CRUCIAL: `redirect: 'manual'` — a 3xx means Metacritic has no generic entry
 * for this slug and is bouncing us to some other platform/version (e.g. an iOS
 * port). We treat that as "no match" (return '') rather than scraping the wrong
 * game's score.
 */
async function mcFetch(url: string, attempt = 0): Promise<string> {
  if (MC_BACKOFFS_MS[attempt]) await new Promise(r => setTimeout(r, MC_BACKOFFS_MS[attempt]))
  const lastAttempt = attempt >= MC_BACKOFFS_MS.length - 1
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25_000)
    let res: Response
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
        signal: controller.signal,
        redirect: 'manual',
      })
    } finally {
      clearTimeout(timer)
    }
    if (res.status === 404) return ''
    // Any redirect = not a confident match for this exact slug → skip it.
    if (res.status >= 300 && res.status < 400) return ''
    if (res.status === 429 || res.status >= 500) {
      if (lastAttempt) return ''
      return mcFetch(url, attempt + 1)
    }
    if (!res.ok) return ''
    const text = await res.text()
    if (!text && !lastAttempt) return mcFetch(url, attempt + 1)
    return text
  } catch {
    if (!lastAttempt) return mcFetch(url, attempt + 1)
    return ''
  }
}

/** Build candidate Metacritic URL slugs from a (DB) game title. */
export function metacriticSlugs(title: string): string[] {
  const cleaned = cleanTitle(title)
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  // base: apostrophes become hyphens too (kirby-s-epic-yarn)
  const base = norm(cleaned).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  // variant: drop apostrophes first so they don't leave a stray hyphen (kirbys-epic-yarn)
  const noApos = norm(cleaned).replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return [...new Set([base, noApos].filter(Boolean))]
}

/**
 * Extract the Metascore from a Metacritic page's JSON-LD. Looks for an
 * aggregateRating named "Metascore" anywhere in the structured data.
 * Returns the 0–100 score, or null when absent/unparseable.
 */
export function parseMetacriticScore(html: string): number | null {
  if (!html) return null
  const blocks = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)
  for (const b of blocks) {
    let json: unknown
    try { json = JSON.parse(b[1]) } catch { continue }
    const found = findMetascore(json)
    if (found != null) return found
  }
  return null
}

function findMetascore(node: unknown): number | null {
  if (!node || typeof node !== 'object') return null
  const obj = node as Record<string, unknown>
  const agg = obj.aggregateRating as Record<string, unknown> | undefined
  if (agg && (agg.name === 'Metascore' || agg['@type'] === 'AggregateRating')) {
    const v = Number(agg.ratingValue)
    if (Number.isFinite(v) && v > 0 && v <= 100) return Math.round(v)
  }
  for (const k of Object.keys(obj)) {
    const r = findMetascore(obj[k])
    if (r != null) return r
  }
  return null
}

/**
 * Fetch a game's Metacritic metascore (0–100) by title, preferring the precise
 * per-platform URL and falling back to the generic one. Returns null when no
 * confident match is found. Paces requests politely.
 */
export async function fetchMetacriticScore(title: string, platformSlug?: string): Promise<number | null> {
  const slugs = metacriticSlugs(title)
  if (slugs.length === 0) return null

  const mcPlatform = platformSlug ? METACRITIC_PLATFORM_SLUGS[platformSlug] : undefined
  const urls: string[] = []
  for (const slug of slugs) {
    if (mcPlatform) urls.push(`${MC_SITE}/game/${mcPlatform}/${slug}/`)
    urls.push(`${MC_SITE}/game/${slug}/`)
  }

  for (let i = 0; i < urls.length; i++) {
    const html = await mcFetch(urls[i])
    const score = parseMetacriticScore(html)
    if (score != null) return score
    if (i < urls.length - 1) await new Promise(r => setTimeout(r, 300)) // be polite between tries
  }
  return null
}
