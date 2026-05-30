import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getLaunchBoxProvider, fetchLaunchBoxGame } from '@/lib/metadata/launchbox'

export const dynamic = 'force-dynamic'

// Cover-art image types worth offering (front-facing art), best first.
const COVER_TYPE_ORDER = [
  /^box\s*-\s*front$/i,
  /box\s*-\s*front/i,
  /box\s*-\s*3d/i,
  /clear\s*logo/i,
  /fanart/i,
  /banner/i,
]

function coverRank(type: string): number {
  const i = COVER_TYPE_ORDER.findIndex((re) => re.test(type))
  return i === -1 ? COVER_TYPE_ORDER.length : i
}

// GET ?gameId=<gh-game-id>&q=<title>  → search LaunchBox, returns { games: [{id,name,platform}] }
// GET ?lbId=<launchbox-id>            → covers for a LaunchBox game, returns { covers: [{url,thumb,style}] }
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q      = searchParams.get('q')?.trim()
    const gameId = searchParams.get('gameId')   // GameHub game id (for platform context)
    const lbId   = searchParams.get('lbId')     // LaunchBox game id

    // ── Step 2: covers for a chosen LaunchBox game ──
    if (lbId) {
      const game = await fetchLaunchBoxGame(Number(lbId))
      if (!game) return NextResponse.json({ covers: [] })
      const covers = (game.images ?? [])
        .filter((img) => coverRank(img.type) < COVER_TYPE_ORDER.length)
        .sort((a, b) => coverRank(a.type) - coverRank(b.type))
        .map((img) => ({ url: img.url, thumb: img.url, style: img.type }))
      return NextResponse.json({ covers })
    }

    // ── Step 1: search games ──
    if (q && gameId) {
      const gh = await db.game.findUnique({
        where: { id: Number(gameId) },
        include: { platform: true },
      })
      if (!gh) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

      const provider = await getLaunchBoxProvider(gh.platform.slug)
      const results = await provider.search(q, gh.platform.slug, q)
      const games = results.slice(0, 8).map((r) => ({
        id:       r.id,
        name:     r.title,
        platform: r.platformName,
      }))
      return NextResponse.json({ games })
    }

    return NextResponse.json({ error: 'Missing q+gameId or lbId' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
