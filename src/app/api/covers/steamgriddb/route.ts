import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function getKey(): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key: 'steamgriddb_key' } })
  return row?.value || process.env.STEAMGRIDDB_API_KEY || process.env.STEAMGRIDDB_KEY || null
}

const BASE = 'https://www.steamgriddb.com/api/v2'

// GET ?q=zelda            → search games, returns { games: [{ id, name }] }
// GET ?gameId=123         → get covers for game, returns { covers: [{ url, thumb }] }
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q      = searchParams.get('q')?.trim()
  const gameId = searchParams.get('gameId')

  const key = await getKey()
  if (!key) {
    return NextResponse.json(
      { error: 'not_configured', message: 'Configure SteamGridDB API Key in Admin → Settings' },
      { status: 503 },
    )
  }

  const headers = { Authorization: `Bearer ${key}` }

  // ── Step 1: search games ─────────────────────────────────────────────────
  if (q) {
    const res  = await fetch(`${BASE}/search/autocomplete/${encodeURIComponent(q)}`, { headers })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data.errors?.[0] ?? 'SteamGridDB error' }, { status: res.status })

    const games = (data.data ?? []).slice(0, 8).map((g: any) => ({
      id:   g.id,
      name: g.name,
    }))
    return NextResponse.json({ games })
  }

  // ── Step 2: get covers for a game ────────────────────────────────────────
  if (gameId) {
    // Portrait covers (600x900) — standard box art format
    const res  = await fetch(`${BASE}/grids/game/${gameId}?dimensions=600x900,342x482&nsfw=false`, { headers })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data.errors?.[0] ?? 'SteamGridDB error' }, { status: res.status })

    const covers = (data.data ?? []).slice(0, 12).map((c: any) => ({
      url:   c.url,
      thumb: c.thumb,
      style: c.style,
      width: c.width,
      height: c.height,
    }))
    return NextResponse.json({ covers })
  }

  return NextResponse.json({ error: 'Missing q or gameId' }, { status: 400 })
}
