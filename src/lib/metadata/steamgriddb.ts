/**
 * Server-side helper: fetch the first portrait cover URL from SteamGridDB.
 *
 * Usage:
 *   const url = await fetchSteamGridDBCover('The Legend of Zelda')
 *   // → 'https://cdn2.steamgriddb.com/grid/...' or null
 */

import { db } from '@/lib/db'

const BASE = 'https://www.steamgriddb.com/api/v2'

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
    const searchRes = await fetch(
      `${BASE}/search/autocomplete/${encodeURIComponent(title)}`,
      { headers },
    )
    if (!searchRes.ok) return null

    const searchData = await searchRes.json()
    const games: Array<{ id: number; name: string }> = searchData.data ?? []
    if (games.length === 0) return null

    const sgdbGameId = games[0].id

    // ── Step 2: fetch portrait grid covers (600×900 or 342×482) ─────────────
    const gridRes = await fetch(
      `${BASE}/grids/game/${sgdbGameId}?dimensions=600x900,342x482&nsfw=false`,
      { headers },
    )
    if (!gridRes.ok) return null

    const gridData = await gridRes.json()
    const covers: Array<{ url: string }> = gridData.data ?? []
    if (covers.length === 0) return null

    return covers[0].url
  } catch {
    return null
  }
}
