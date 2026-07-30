/**
 * libretro-thumbnails as a cover source.
 *
 * Why it exists: LaunchBox, SteamGridDB and RAWG index by *game*. Ask them for
 * "Crash Bandicoot XS" and you may well get the PlayStation 2 box, or a modern
 * 2:3 poster — on a library of 37 GBA/SNES/DS titles every stored cover came
 * back 1200x1800, a shape no cartridge ever had. libretro-thumbnails is indexed
 * by *system* first and by No-Intro file name second, so what it returns is the
 * box that actually shipped for that platform, in its real proportions: square
 * for Game Boy Advance, landscape for a PAL SNES, tall for a Japanese Super
 * Famicom.
 *
 * Matching happens against the ROM's file name rather than the cleaned title,
 * because that name is usually already No-Intro ("Arthur and the Minimoys
 * (Europe) (En,Fr,De,Es,It,Nl).gba") and carries the region, which is what
 * decides *which* of a game's boxes is the right one.
 *
 * No API key: the archive is served as plain directory listings over HTTPS.
 */

/** GameHub platform slug → libretro system directory. */
export const LIBRETRO_SYSTEMS: Record<string, string> = {
  gba:      'Nintendo - Game Boy Advance',
  gb:       'Nintendo - Game Boy',
  gbc:      'Nintendo - Game Boy Color',
  nes:      'Nintendo - Nintendo Entertainment System',
  snes:     'Nintendo - Super Nintendo Entertainment System',
  'super-nintendo-entertainment-system': 'Nintendo - Super Nintendo Entertainment System',
  'super-nintendo':                      'Nintendo - Super Nintendo Entertainment System',
  sfc:      'Nintendo - Super Nintendo Entertainment System',
  n64:      'Nintendo - Nintendo 64',
  nds:      'Nintendo - Nintendo DS',
  '3ds':    'Nintendo - Nintendo 3DS',
  gamecube: 'Nintendo - GameCube',
  wii:      'Nintendo - Wii',
  wiiu:     'Nintendo - Wii U',
  ps1:      'Sony - PlayStation',
  ps2:      'Sony - PlayStation 2',
  psp:      'Sony - PlayStation Portable',
  psvita:   'Sony - PlayStation Vita',
  'psvita-ports': 'Sony - PlayStation Vita',
  // Deliberately absent: Nintendo Switch. The archive has no Switch set, and
  // returning nothing is better than returning another platform's art.
}

const BASE = 'https://thumbnails.libretro.com'

/** True when this platform can be served at all. */
export function libretroSupports(platformSlug: string): boolean {
  return platformSlug in LIBRETRO_SYSTEMS
}

// ── Index cache ───────────────────────────────────────────────────────────────
// A system listing is 1–2 MB of HTML and thousands of names, and a batch run
// asks for the same platform hundreds of times in a row. Parse it once, keep the
// names, and re-fetch only after the TTL. In-flight requests are shared so a
// burst at the start of a batch doesn't fetch the same listing N times.

const INDEX_TTL_MS = 6 * 60 * 60 * 1000
const indexCache = new Map<string, { names: string[]; at: number }>()
const inFlight = new Map<string, Promise<string[]>>()

async function loadIndex(system: string): Promise<string[]> {
  const cached = indexCache.get(system)
  if (cached && Date.now() - cached.at < INDEX_TTL_MS) return cached.names

  const pending = inFlight.get(system)
  if (pending) return pending

  const job = (async () => {
    const url = `${BASE}/${encodeURIComponent(system)}/Named_Boxarts/`
    const res = await fetch(url, { headers: { 'User-Agent': 'GameHub' } })
    if (!res.ok) throw new Error(`libretro index ${system}: ${res.status}`)
    const html = await res.text()
    const names: string[] = []
    // Directory listing: <a href="Game%20Name%20(Europe).png">
    const re = /href="([^"?][^"]*\.png)"/g
    for (let m = re.exec(html); m !== null; m = re.exec(html)) {
      names.push(decodeURIComponent(m[1]).slice(0, -4))
    }
    indexCache.set(system, { names, at: Date.now() })
    return names
  })().finally(() => inFlight.delete(system))

  inFlight.set(system, job)
  return job
}

// ── Matching ──────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip accents: "Pokémon" === "Pokemon"
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Split "Game (Europe) (En,Fr).png" into its title and its parenthesised tags. */
function split(name: string): { core: string; tags: string } {
  const tags = (name.match(/\(([^)]*)\)/g) ?? []).join(' ').toLowerCase()
  return { core: normalize(name.replace(/\([^)]*\)/g, ' ')), tags }
}

// Which edition to prefer when a game shipped in several regions. Spanish and
// European first: this library is Spanish, and the PAL box is the one its owner
// recognises.
const REGION_ORDER = ['spain', 'europe', 'esp', 'usa', 'world', 'japan']
// Non-commercial dumps carry art that was never on a shelf, so they lose every
// tie — but they still match, for the libraries that only hold a prototype.
const NON_COMMERCIAL = ['beta', 'proto', 'prototype', 'sample', 'demo', 'kiosk', 'debug']

function editionRank(tags: string): number {
  const penalty = NON_COMMERCIAL.some(t => new RegExp(`\\b${t}\\b`).test(tags)) ? 100 : 0
  const idx = REGION_ORDER.findIndex(r => new RegExp(`\\b${r}\\b`).test(tags))
  return penalty + (idx === -1 ? REGION_ORDER.length : idx)
}

/** Similarity 0–100 between two normalized titles. */
function similarity(a: string, b: string): number {
  if (a === b) return 100
  const wa = new Set(a.split(' ').filter(Boolean))
  const wb = new Set(b.split(' ').filter(Boolean))
  if (wa.size === 0 || wb.size === 0) return 0
  let shared = 0
  wa.forEach(w => { if (wb.has(w)) shared++ })
  const union = new Set([...wa, ...wb]).size
  const jaccard = Math.round((100 * shared) / union)
  // One title being a prefix of the other is a strong signal a subtitle differs
  // ("Ninja Cop" vs "Ninja Cop Advance"), which Jaccard alone punishes too hard.
  return a.startsWith(b) || b.startsWith(a) ? Math.max(jaccard, 88) : jaccard
}

/** Below this the candidate is a different game, not a naming variant. */
const MIN_SCORE = 60

export interface BoxartCandidate {
  /** Index entry, e.g. "Ninja Cop (Europe)". */
  name: string
  /** 0-100 similarity to the query. */
  score: number
  /** Lower is a more desirable edition (Spanish/European first, dumps last). */
  rank: number
}

/**
 * Every index entry close enough to `query`, best first. `query` may be a ROM
 * file name or a plain title; the extension and the parenthesised tags are
 * ignored when comparing, and used only to order editions.
 */
export function rankBoxarts(query: string, names: readonly string[]): BoxartCandidate[] {
  const local = split(query.replace(/\.[^.]+$/, ''))
  if (!local.core) return []
  const localWords = local.core.split(' ').length

  const out: BoxartCandidate[] = []
  for (const candidate of names) {
    const cand = split(candidate)
    const score = similarity(local.core, cand.core)
    if (score < MIN_SCORE) continue

    // A far shorter index title swallows ours rather than naming it: the entry
    // "Pokemon" would otherwise win for the ROM hack "Pokemon Perfect Fire Red"
    // and hand it the wrong box entirely.
    const candWords = cand.core.split(' ').length
    if (cand.core !== local.core && candWords * 2 <= localWords) continue

    out.push({ name: candidate, score, rank: editionRank(cand.tags) })
  }
  return out.sort((a, b) => b.score - a.score || a.rank - b.rank)
}

/**
 * Best entry in `names` for a ROM file name, or null when nothing is close
 * enough. Exported for testing and for the review tooling.
 */
export function matchBoxart(fileName: string, names: readonly string[]): string | null {
  return rankBoxarts(fileName, names)[0]?.name ?? null
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * URL of the original box art for a ROM, or null when the platform isn't in the
 * archive, the listing can't be read, or no entry is close enough.
 *
 * Never throws: a cover source going down must not fail a metadata run.
 */
export async function fetchLibretroCover(
  fileName: string,
  platformSlug: string,
): Promise<string | null> {
  const system = LIBRETRO_SYSTEMS[platformSlug]
  if (!system || !fileName) return null

  try {
    const names = await loadIndex(system)
    const match = matchBoxart(fileName, names)
    if (!match) return null
    return `${BASE}/${encodeURIComponent(system)}/Named_Boxarts/${encodeURIComponent(match)}.png`
  } catch {
    return null
  }
}

/** Public URL of one index entry. */
export function boxartUrl(system: string, name: string): string {
  return `${BASE}/${encodeURIComponent(system)}/Named_Boxarts/${encodeURIComponent(name)}.png`
}

/**
 * Candidate boxarts for a manual search in the admin cover picker. Unlike the
 * automatic path this returns several, because the whole point of searching by
 * hand is that the operator can see which edition's box they actually want.
 *
 * Never throws — an unreachable archive yields an empty list.
 */
export async function searchLibretroCovers(
  query: string,
  platformSlug: string,
  limit = 12,
): Promise<Array<{ name: string; url: string; score: number }>> {
  const system = LIBRETRO_SYSTEMS[platformSlug]
  if (!system || !query.trim()) return []
  try {
    const names = await loadIndex(system)
    return rankBoxarts(query, names)
      .slice(0, limit)
      .map(c => ({ name: c.name, url: boxartUrl(system, c.name), score: c.score }))
  } catch {
    return []
  }
}
