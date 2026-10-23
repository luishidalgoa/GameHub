import { calcTitleConfidence, AUTO_THRESHOLD } from './scoring'
import { fileToTitle } from '@/lib/utils'
import { fetchHtmlWithRetry, type HtmlFetchPolicy } from './http'

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
const MC_FETCH: HtmlFetchPolicy = {
  userAgent: UA,
  backoffsMs: MC_BACKOFFS_MS,
  redirect: 'manual',
  failOnStatus: false,
  throwOnError: false,
  label: 'Metacritic',
}

/**
 * A platform-specific URL may be redirected to the game's merged page, which
 * lists every platform the game ran on (Inazuma Eleven: /game/3ds/... goes to
 * /game/inazuma-eleven/, listing DS and 3DS). We follow that redirect, and
 * accept the page only if its structured data lists the requested platform
 * (see pageListsPlatform). A port on another platform therefore still fails.
 */
const MC_FETCH_FOLLOW: HtmlFetchPolicy = { ...MC_FETCH, redirect: 'follow' }

function mcFetch(url: string, policy: HtmlFetchPolicy = MC_FETCH): Promise<string> {
  return fetchHtmlWithRetry(url, policy)
}

/** Metacritic's name for each platform path segment we ask for. Unlisted → no match. */
const MC_PLATFORM_LABEL: Record<string, string> = {
  '3ds': '3DS', ds: 'DS', switch: 'Switch', wii: 'Wii', 'wii-u': 'Wii U', gamecube: 'GameCube',
  'nintendo-64': 'Nintendo 64', 'super-nintendo': 'SNES', nes: 'NES',
  'game-boy-advance': 'Game Boy Advance', 'game-boy-color': 'Game Boy Color', 'game-boy': 'Game Boy',
  psp: 'PSP', 'playstation-vita': 'PlayStation Vita', playstation: 'PlayStation',
  'playstation-2': 'PlayStation 2', 'playstation-3': 'PlayStation 3', pc: 'PC',
}

/** "Nintendo Switch" and "Switch" are the same platform: drop the maker and punctuation. */
function platformKey(name: string): string {
  return name.toLowerCase().replace(/nintendo/g, '').replace(/[^a-z0-9]+/g, '')
}

/** True when the page's structured data lists the platform (Metacritic's `gamePlatform`). */
export function pageListsPlatform(html: string, label: string | undefined): boolean {
  if (!label) return false
  const want = platformKey(label)
  for (const b of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    let json: { gamePlatform?: unknown } | null
    try { json = JSON.parse(b[1]) } catch { continue }
    const raw = json?.gamePlatform
    const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []
    if (list.some((p) => typeof p === 'string' && platformKey(p) === want)) return true
  }
  return false
}

/** Build candidate Metacritic URL slugs from a (DB) game title. */
export function metacriticSlugs(title: string): string[] {
  const cleaned = fileToTitle(title)
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

/** True when the page's own title (og:title) matches the game we are looking for. */
export function pageIsSameGame(html: string, title: string): boolean {
  const m = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
  if (!m) return false
  const pageTitle = m[1].replace(/\s*[-|]\s*Metacritic.*$/i, '').replace(/\s+(Reviews|Critic Reviews).*$/i, '').trim()
  return calcTitleConfidence(title, pageTitle, false) >= AUTO_THRESHOLD
}

/**
 * Fetch a game's Metacritic metascore (0–100) by title, preferring the precise
 * per-platform URL (the generic one only when the platform is unknown). Returns null when no
 * confident match is found. Paces requests politely.
 */
export async function fetchMetacriticScore(title: string, platformSlug?: string): Promise<number | null> {
  const slugs = metacriticSlugs(title)
  if (slugs.length === 0) return null

  // With a known platform, the generic URL can point at another version of the
  // game, so only the platform-specific page is accepted. A platform we cannot
  // map gets no page at all (#115): the generic one is never a safe guess.
  const mcPlatform = platformSlug ? METACRITIC_PLATFORM_SLUGS[platformSlug] : undefined
  if (platformSlug && !mcPlatform) return null
  const urls: string[] = []
  for (const slug of slugs) {
    if (mcPlatform) urls.push(`${MC_SITE}/game/${mcPlatform}/${slug}/`)
    else urls.push(`${MC_SITE}/game/${slug}/`)
  }

  const wantLabel = mcPlatform ? MC_PLATFORM_LABEL[mcPlatform] : undefined
  const policy = mcPlatform ? MC_FETCH_FOLLOW : MC_FETCH
  for (let i = 0; i < urls.length; i++) {
    const html = await mcFetch(urls[i], policy)
    const score = parseMetacriticScore(html)
    // A score is only taken from a page whose own title is the same game (#115):
    // the score alone does not say which game it belongs to. With a known
    // platform the page must also list that platform, since a redirect can land
    // on another version of the game.
    if (score != null && pageIsSameGame(html, title) && (!mcPlatform || pageListsPlatform(html, wantLabel))) return score
    if (i < urls.length - 1) await new Promise(r => setTimeout(r, 300)) // be polite between tries
  }
  return null
}
