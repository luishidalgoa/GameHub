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
