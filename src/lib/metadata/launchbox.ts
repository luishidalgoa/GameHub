import type { MetadataProvider, MetadataResult } from './provider'
import { cleanTitle } from './rawg'
import { db } from '@/lib/db'

// LaunchBox Games Database — no API key, no browser/GUI required. Everything is
// scraped from server-rendered HTML over plain HTTP, so it runs headless on the
// Raspberry Pi:
//
//   Search:  GET {SITE}/games/results/?platform=<name>&title=<title>
//            → server-rendered result cards. We parse the
//              `/games/details/<id>-<slug>` links (+ <h3> title / <p> platform).
//   Detail:  GET {SITE}/games/details/<id>-<slug>
//            → server-rendered detail page. Title (<h1>), developer/publisher/
//              genre (labelled links), ESRB/release-date/platform (text), and
//              images whose <img alt> labels each type ("… - Box - Front …",
//              "… - Screenshot - Gameplay …"). Cover = Box - Front; screenshots
//              = Screenshot.
//   Images live on the CDN host below (alt classifies each).
//
// As with the RAWG / SteamGridDB providers, these are external-service constants
// (not GameHub's own deployment config), so they live here.
const LB_SITE = 'https://gamesdb.launchbox-app.com'
const LB_IMG_HOST = 'images.launchbox-app.com'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

// ── Default GameHub slug → LaunchBox platform name ────────────────────────────
// Seed values; refresh/validate against the live list with
// `npm run launchbox:platforms` (writes the DB-cached map below).
export const LAUNCHBOX_PLATFORM_NAMES: Record<string, string> = {
  ps1:       'Sony Playstation',
  ps2:       'Sony Playstation 2',
  ps3:       'Sony Playstation 3',
  psp:       'Sony PSP',
  psvita:    'Sony Playstation Vita',
  gamecube:  'Nintendo GameCube',
  wii:       'Nintendo Wii',
  wiiu:      'Nintendo Wii U',
  switch:    'Nintendo Switch',
  n64:       'Nintendo 64',
  snes:      'Super Nintendo Entertainment System (SNES)',
  nes:       'Nintendo Entertainment System',
  gba:       'Nintendo Game Boy Advance',
  gb:        'Nintendo Game Boy',
  gbc:       'Nintendo Game Boy Color',
  nds:       'Nintendo DS',
  '3ds':     'Nintendo 3DS',
  genesis:   'Sega Genesis / Mega Drive',
  megadrive: 'Sega Genesis / Mega Drive',
  dreamcast: 'Sega Dreamcast',
  saturn:    'Sega Saturn',
  segacd:    'Sega CD / Mega-CD',
  gamegear:  'Sega Game Gear',
  mastersystem: 'Sega Master System / Mark III',
  xbox:      'Microsoft Xbox',
  xbox360:   'Microsoft Xbox 360',
  pc:        'Windows',
  dos:       'MS-DOS',
  arcade:    'Arcade',
}

// ── Platform-name normalization / fuzzy matching ──────────────────────────────
const normPlatform = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

function platformTokenScore(a: string, b: string): number {
  const ta = new Set(normPlatform(a).split(' ').filter(Boolean))
  const tb = new Set(normPlatform(b).split(' ').filter(Boolean))
  if (ta.size === 0 || tb.size === 0) return 0
  const inter = [...ta].filter(t => tb.has(t)).length
  return inter / Math.max(ta.size, tb.size)
}

// Cache the full LaunchBox catalog (the `launchbox_platforms` setting) in memory
// so resolution doesn't re-read/parse the DB on every game during a scan.
let _catalogCache: LaunchBoxPlatform[] | null = null

/** Read the cached full LaunchBox platform catalog (refreshed by the re-scan script). */
export async function getLaunchBoxCatalog(): Promise<LaunchBoxPlatform[]> {
  if (_catalogCache) return _catalogCache
  try {
    const row = await db.setting.findUnique({ where: { key: 'launchbox_platforms' } })
    if (row?.value) _catalogCache = JSON.parse(row.value) as LaunchBoxPlatform[]
  } catch { /* no catalog cached yet */ }
  return _catalogCache ?? []
}

/** Drop the in-memory catalog cache (called after a re-scan writes a fresh list). */
export function clearLaunchBoxCatalogCache(): void {
  _catalogCache = null
}

/**
 * Resolve a GameHub platform slug to the LaunchBox platform name, in order:
 *   1. manual override in `launchbox_platform_map` (Admin → Settings),
 *   2. built-in alias for tricky slugs (gba → "Nintendo Game Boy Advance", …),
 *   3. the FULL LaunchBox catalog (all ~189 platforms, refreshed by
 *      `npm run launchbox:platforms`): exact name match, then a fuzzy token match
 *      against the GameHub platform's display name.
 * This means any platform LaunchBox has — not just a hardcoded few — can resolve.
 */
export async function getLaunchBoxPlatformName(slug: string): Promise<string | null> {
  // 1. manual override
  try {
    const row = await db.setting.findUnique({ where: { key: 'launchbox_platform_map' } })
    if (row?.value) {
      const map = JSON.parse(row.value) as Record<string, string>
      if (map[slug]) return map[slug]
    }
  } catch { /* ignore */ }

  // 2. built-in alias
  if (LAUNCHBOX_PLATFORM_NAMES[slug]) return LAUNCHBOX_PLATFORM_NAMES[slug]

  // 3. dynamic match against the full catalog, using the GameHub platform's name
  try {
    const [platform, catalog] = await Promise.all([
      db.platform.findUnique({ where: { slug }, select: { name: true } }),
      getLaunchBoxCatalog(),
    ])
    if (platform && catalog.length) {
      const want = normPlatform(platform.name)
      const exact = catalog.find(p => normPlatform(p.name) === want)
      if (exact) return exact.name
      let best: { name: string; score: number } | null = null
      for (const p of catalog) {
        const s = platformTokenScore(platform.name, p.name)
        if (!best || s > best.score) best = { name: p.name, score: s }
      }
      if (best && best.score >= 0.5) return best.name
    }
  } catch { /* ignore */ }

  return null
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
// LaunchBox rate-limits bursts (e.g. a search immediately followed by the detail
// fetch): the response comes back as an empty 200, a 429, or a connect timeout.
// We retry with exponential backoff so paced scans recover on their own. A real
// 404 returns '' immediately (not an error — the game just isn't there).
const LB_BACKOFFS_MS = [0, 2000, 5000, 9000] // wait before attempts 0..3

async function lbFetch(url: string, attempt = 0): Promise<string> {
  if (LB_BACKOFFS_MS[attempt]) {
    await new Promise(r => setTimeout(r, LB_BACKOFFS_MS[attempt]))
  }
  const lastAttempt = attempt >= LB_BACKOFFS_MS.length - 1
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25_000)
    let res: Response
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
    if (res.status === 404) return ''
    if (res.status === 429 || res.status >= 500) {
      // Rate-limited / transient server error — back off and retry.
      if (lastAttempt) return ''
      return lbFetch(url, attempt + 1)
    }
    if (!res.ok) throw new Error(`LaunchBox ${res.status} for ${url}`)
    const text = await res.text()
    if (!text && !lastAttempt) return lbFetch(url, attempt + 1) // empty 200 → retry
    return text
  } catch (err) {
    if (!lastAttempt) return lbFetch(url, attempt + 1) // network/abort → retry
    throw err
  }
}

// ── Small HTML helpers ────────────────────────────────────────────────────────
function decodeEntities(s: string): string {
  return s
    // Numeric entities: &#43; (dec) and &#x2B; (hex) → the actual char.
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&') // last: so "&amp;#39;" doesn't double-decode
    .trim()
}

const firstMatch = (html: string, re: RegExp): string | undefined => {
  const m = html.match(re)
  return m ? decodeEntities(m[1]) : undefined
}

// ── Search ────────────────────────────────────────────────────────────────────
export interface LaunchBoxCandidate {
  id: number
  slug: string
  title: string
  platform?: string
}

/**
 * Parse a LaunchBox results page into candidates.
 *
 * Each card looks like:
 *   <div … class="games-grid-card …">
 *     <a … href="/games/details/3226-doom-ii">
 *       …<h3>DOOM II</h3><p>Nintendo Game Boy Advance</p>…
 *
 * The `<id>` in the link is the website id used by the detail page.
 */
export function parseLaunchBoxResults(html: string): LaunchBoxCandidate[] {
  const out: LaunchBoxCandidate[] = []
  const seen = new Set<number>()
  // Split on each card so the title/platform we read belong to the same game.
  const cards = html.split(/<div[^>]*class="[^"]*games-grid-card/i).slice(1)
  for (const card of cards) {
    const link = card.match(/\/games\/details\/(\d+)-([a-z0-9-]+)/i)
    if (!link) continue
    const id = Number(link[1])
    if (seen.has(id)) continue
    seen.add(id)
    const title = card.match(/<h3[^>]*>\s*([^<]+?)\s*<\/h3>/)?.[1]
    const platform = card.match(/<\/h3>\s*<p[^>]*>\s*([^<]+?)\s*<\/p>/)?.[1]
    out.push({
      id,
      slug: link[2],
      title: title ? decodeEntities(title) : link[2].replace(/-/g, ' '),
      platform: platform ? decodeEntities(platform) : undefined,
    })
  }
  return out
}

/**
 * Build the LaunchBox results-page query the way the site's own search box does
 * (`parseSearchValue` in their custom.js): recognised keys become `?key=val`
 * pairs, then the whole `?…` string is encoded in one pass.
 */
function buildResultsQuery(platformName: string | null, title: string): string {
  const parts: string[] = []
  if (platformName) parts.push(`platform=${platformName}`)
  parts.push(`title=${cleanTitle(title)}`)
  return encodeURI(`?${parts.join('&')}`)
}

/**
 * Search LaunchBox for a title, optionally filtered to a platform name. Returns
 * candidates carrying the website id (used by fetchLaunchBoxGame).
 */
export async function searchLaunchBox(
  platformName: string | null,
  title: string,
): Promise<LaunchBoxCandidate[]> {
  const query = buildResultsQuery(platformName, title)
  const html = await lbFetch(`${LB_SITE}/games/results/${query}`)
  if (!html) return []
  return parseLaunchBoxResults(html)
}

// ── Detail ──────────────────────────────────────────────────────────────────
export interface LaunchBoxImage {
  url: string
  /** e.g. "Box - Front", "Screenshot - Gameplay", "Box - Back". */
  type: string
  region?: string
}

export interface LaunchBoxGame extends MetadataResult {
  source: 'launchbox'
  images: LaunchBoxImage[]
}

/** Extract every LaunchBox CDN image from the rendered <img>, typed by its alt. */
export function parseLaunchBoxImages(html: string): LaunchBoxImage[] {
  const out: LaunchBoxImage[] = []
  const seen = new Set<string>()
  const re = new RegExp(
    `<img[^>]+src="(https?://${LB_IMG_HOST.replace(/\./g, '\\.')}/+[^"]+\\.(?:jpg|jpeg|png|gif))"[^>]*alt="([^"]*)"`,
    'gi',
  )
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    // Normalize the accidental double slash in the CDN path.
    const url = m[1].replace(`${LB_IMG_HOST}//`, `${LB_IMG_HOST}/`)
    if (seen.has(url)) continue
    seen.add(url)
    const alt = decodeEntities(m[2])
    // alt format: "<Game> - <Type> (<Region>) - <WxH>"
    let type = 'Unknown'
    let region: string | undefined
    const typeMatch = alt.match(/ - ([^()]+?)(?:\s*\(([^)]*)\))?\s*-\s*\d+\s*[x×]\s*\d+\s*$/i)
    if (typeMatch) {
      type = typeMatch[1].trim()
      region = typeMatch[2]?.trim() || undefined
    } else if (/screenshot/i.test(alt)) {
      type = 'Screenshot - Gameplay'
    } else if (/box\s*-\s*front/i.test(alt)) {
      type = 'Box - Front'
    }
    out.push({ url, type, region })
  }
  return out
}

/** Parse a LaunchBox detail page into a MetadataResult (+ raw image list). */
export function parseLaunchBoxDetail(html: string, id: number, slug?: string): LaunchBoxGame | null {
  if (!html) return null

  const title =
    firstMatch(html, /<h1[^>]*>\s*([^<]+?)\s*</) ??
    (slug ? slug.replace(/-/g, ' ') : undefined)
  if (!title) return null

  // Labelled links: /developers|publishers|genres/games/<id>-<name>
  const linkText = (kind: string): string | undefined =>
    firstMatch(html, new RegExp(`/${kind}/games/[^"']*"[^>]*>\\s*([^<]+?)\\s*<`, 'i'))
  const developer = linkText('developers')
  const publisher = linkText('publishers')
  const genre     = linkText('genres')

  // ESRB / release date / platform are plain text after their labels.
  const flat = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
  const esrb = firstMatch(
    flat,
    /ESRB\s+([A-Za-z][A-Za-z0-9 +-]*?)(?:\s{2,}|Developer|Publisher|Genre|Platform|Overview|$)/,
  )
  const dateStr =
    firstMatch(flat, /Release Date\s+([A-Z][a-z]+ \d{1,2},? \d{4}|\d{4})/) ||
    firstMatch(flat, /Released\s+([A-Z][a-z]+ \d{1,2},? \d{4}|\d{4})/)
  const releaseYear = dateStr ? Number((dateStr.match(/\d{4}/) || [])[0]) || undefined : undefined
  const platformName = firstMatch(
    flat,
    /Platform\s+([A-Za-z0-9][A-Za-z0-9 .'/()-]*?)(?:\s{2,}|Overview|Developer|Publisher|Genre|ESRB|Share|$)/,
  )

  // Description: og:description / meta description as a reliable short text.
  const description =
    firstMatch(html, /<meta[^>]+name="description"[^>]+content="([^"]*)"/i) ||
    firstMatch(html, /<meta[^>]+content="([^"]*)"[^>]+name="description"/i)

  const images = parseLaunchBoxImages(html)
  const cover =
    images.find(i => /^box\s*-\s*front$/i.test(i.type))?.url ??
    images.find(i => /box\s*-\s*front/i.test(i.type))?.url ??
    images.find(i => /box\s*-\s*3d/i.test(i.type))?.url ??
    images[0]?.url
  const screenshots = images.filter(i => /screenshot/i.test(i.type)).map(i => i.url)

  return {
    id,
    slug,
    title: decodeEntities(title),
    description: description || undefined,
    releaseYear,
    genre,
    developer,
    publisher,
    esrb: esrb?.trim() || undefined,
    platformName: platformName?.trim() || undefined,
    coverUrl: cover,
    screenshots,
    images,
    source: 'launchbox',
  }
}

/** Fetch & parse a single LaunchBox game by its website id (slug optional). */
export async function fetchLaunchBoxGame(id: number, slug?: string): Promise<LaunchBoxGame | null> {
  const path = slug ? `${id}-${slug}` : String(id)
  const html = await lbFetch(`${LB_SITE}/games/details/${path}`)
  return parseLaunchBoxDetail(html, id, slug)
}

// ── Platform list (for the re-scan script) ────────────────────────────────────
export interface LaunchBoxPlatform { id: number; name: string }

/** Parse the homepage `<select name="platformId">` into {id,name} pairs. */
export function parseLaunchBoxPlatformOptions(html: string): LaunchBoxPlatform[] {
  const sel = html.match(/<select[^>]*name="platformId"[^>]*>([\s\S]*?)<\/select>/i)
  const scope = sel ? sel[1] : html
  const out: LaunchBoxPlatform[] = []
  const re = /<option[^>]*value="(\d+)"[^>]*>\s*([^<]+?)\s*<\/option>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(scope)) !== null) {
    out.push({ id: Number(m[1]), name: decodeEntities(m[2].replace(/\s+/g, ' ')) })
  }
  return out
}

/** Fetch the full LaunchBox platform list from the homepage. */
export async function fetchLaunchBoxPlatforms(): Promise<LaunchBoxPlatform[]> {
  const html = await lbFetch(`${LB_SITE}/`)
  return parseLaunchBoxPlatformOptions(html)
}

// ── Provider adapter (matches the RAWG provider shape) ────────────────────────
class LaunchBoxProvider implements MetadataProvider {
  constructor(private platformName: string | null) {}

  async search(title: string, _platform: string, overrideQuery?: string): Promise<MetadataResult[]> {
    const candidates = await searchLaunchBox(this.platformName, overrideQuery ?? title)
    return candidates.map(c => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      platformName: c.platform ?? this.platformName ?? undefined,
      source: 'launchbox' as const,
    }))
  }

  async fetchById(id: number): Promise<MetadataResult | null> {
    return fetchLaunchBoxGame(id)
  }
}

/** Build a LaunchBox provider for a GameHub platform slug. */
export async function getLaunchBoxProvider(platformSlug: string): Promise<MetadataProvider> {
  const name = await getLaunchBoxPlatformName(platformSlug)
  return new LaunchBoxProvider(name)
}
