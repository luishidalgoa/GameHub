import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getLaunchBoxProvider, fetchLaunchBoxGame } from '@/lib/metadata/launchbox'

export const dynamic = 'force-dynamic'

// Cover-art image types worth offering (front-facing art), best first.
// IMPORTANT: a "Fanart - Box - Front" also contains "box - front", so it must be
// ranked by its Fanart-ness FIRST (official art always wins). We check fanart
// before the generic box-front patterns so user-made art never outranks the
// real cover — that mis-ordering was auto-assigning the wrong cover ~10% of the
// time.
function coverRank(type: string): number {
  const isFanart = /fanart/i.test(type)
  if (!isFanart && /^box\s*-\s*front$/i.test(type)) return 0   // official exact box front
  if (!isFanart && /box\s*-\s*front/i.test(type))   return 1   // official box front (loose)
  if (!isFanart && /box\s*-\s*3d/i.test(type))       return 2
  if (/clear\s*logo/i.test(type))                    return 3
  if (/box\s*-\s*front/i.test(type))                 return 4   // fanart box front
  if (/fanart/i.test(type))                          return 5
  if (/banner/i.test(type))                          return 6
  return 7
}

const COVER_TYPE_MAX = 7   // ranks >= this aren't offered as covers

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
        .filter((img) => coverRank(img.type) < COVER_TYPE_MAX)
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
