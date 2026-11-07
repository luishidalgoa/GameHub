/**
 * Server-side helper: fetch the first portrait cover URL from SteamGridDB.
 *
 * Usage:
 *   const url = await fetchSteamGridDBCover('The Legend of Zelda')
 *   // → 'https://cdn2.steamgriddb.com/grid/...' or null
 */

import { db } from '@/lib/db'
import { providerFetch } from './http'

const BASE = 'https://www.steamgriddb.com/api/v2'
// Un servidor sin salida a SteamGridDB espera el timeout completo en cada juego: se corta
// pronto y, si la red falla, no se vuelve a llamar durante un rato.
const TIMEOUT_MS = 3_000
const PAUSE_MS = 10 * 60_000
let pausedUntil = 0

async function sgdbFetch(url: string, headers: Record<string, string>): Promise<Response> {
  if (Date.now() < pausedUntil) throw new Error('SteamGridDB en pausa tras un fallo de red')
  try {
    return await providerFetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (err) {
    pausedUntil = Date.now() + PAUSE_MS
    throw err
  }
}

async function getApiKey(): Promise<string | null> {
  try {
    const row = await db.setting.findUnique({ where: { key: 'steamgriddb_key' } })
    return row?.value || process.env.STEAMGRIDDB_API_KEY || process.env.STEAMGRIDDB_KEY || null
  } catch {
    return null
  }
}

/**
 * Search SteamGridDB for the given title and return the URL of the first
 * portrait cover found.  Returns null if the key is not configured, the game
 * is not found, or any network/API error occurs.
 */
export async function fetchSteamGridDBCover(title: string): Promise<string | null> {
  try {
    const key = await getApiKey()
    if (!key) return null

    const headers = { Authorization: `Bearer ${key}` }

    // ── Step 1: search for the game ──────────────────────────────────────────
    const searchRes = await sgdbFetch(`${BASE}/search/autocomplete/${encodeURIComponent(title)}`, headers)
    if (!searchRes.ok) return null

    const searchData = await searchRes.json()
    const games: Array<{ id: number; name: string }> = searchData.data ?? []
    if (games.length === 0) return null

    const sgdbGameId = games[0].id

    // ── Step 2: prefer portrait box-art (600×900 / 342×482) ─────────────────
    const portrait = await fetchGrid(sgdbGameId, headers, '&dimensions=600x900,342x482')
    if (portrait) return portrait

    // ── Step 3: fall back to ANY cover (helps GBA and other non-portrait box
    //    art — better a square cover than dropping to the RAWG image) ─────────
    return await fetchGrid(sgdbGameId, headers, '')
  } catch {
    return null
  }
}

async function fetchGrid(
  gameId: number,
  headers: Record<string, string>,
  dimensionsParam: string,
): Promise<string | null> {
  try {
    const res = await sgdbFetch(`${BASE}/grids/game/${gameId}?nsfw=false${dimensionsParam}`, headers)
    if (!res.ok) return null
    const data = await res.json()
    const covers: Array<{ url: string }> = data.data ?? []
    return covers[0]?.url ?? null
  } catch {
    return null
  }
}

/**
 * The SteamGridDB art types the automatic flow can use beyond covers: heroes (wide banners,
 * the game's backdrop), logos (transparent title logos) and icons. The paths are the ones the
 * steamgriddb_api client uses (/heroes/game/{id}, /logos/game/{id}, /icons/game/{id}); their
 * response matches /grids. Not checked against a live key from here.
 */
export type SgdbArtType = 'heroes' | 'logos' | 'icons'

/** Game ids of titles already matched, for a day: the banner, logo and icon of one game share one search. */
const ID_TTL_MS = 24 * 60 * 60_000
const gameIdByTitle = new Map<string, { id: number; at: number }>()

/** The comparison key of a title: letters and digits only, without accents or case. */
function titleKey(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * The SteamGridDB game for a title. The search hit must have the same name as the title (ignoring
 * case, accents and punctuation): a hit with another name is another game, and its art is not used.
 */
async function gameIdFor(title: string, headers: Record<string, string>): Promise<number | null> {
  const key = titleKey(title)
  if (!key) return null
  const known = gameIdByTitle.get(key)
  if (known && Date.now() - known.at < ID_TTL_MS) return known.id
  const searchRes = await sgdbFetch(`${BASE}/search/autocomplete/${encodeURIComponent(title)}`, headers)
  if (!searchRes.ok) return null
  const games: Array<{ id: number; name: string }> = (await searchRes.json()).data ?? []
  const match = games.find(g => titleKey(g.name) === key)
  if (!match) return null
  gameIdByTitle.set(key, { id: match.id, at: Date.now() })
  return match.id
}

/**
 * URLs of the images of that type SteamGridDB has for the title, best first. Empty when the title
 * is not a SteamGridDB game by name, or when SteamGridDB has none of that type. The caller takes the
 * first one the owner has not removed.
 */
export async function fetchSteamGridDBArts(title: string, type: SgdbArtType): Promise<string[]> {
  try {
    const key = await getApiKey()
    if (!key) return []
    const headers = { Authorization: `Bearer ${key}` }
    const id = await gameIdFor(title, headers)
    if (id == null) return []
    const res = await sgdbFetch(`${BASE}/${type}/game/${id}?nsfw=false`, headers)
    if (!res.ok) return []
    const items: Array<{ url: string }> = (await res.json()).data ?? []
    return items.map(i => i.url).filter(Boolean).slice(0, 10)
  } catch {
    return []
  }
}
