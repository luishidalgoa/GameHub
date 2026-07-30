import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { searchLibretroCovers, libretroSupports } from '@/lib/metadata/libretro'

export const dynamic = 'force-dynamic'

/**
 * GET ?q=<title>&gameId=<id>       → covers for that game's platform
 * GET ?q=<title>&platform=<slug>   → covers for an explicit platform
 *
 * One step, unlike the SteamGridDB route: every entry in the archive *is* a
 * cover, so there is no game to select first.
 *
 * The platform is required rather than optional because it is the whole point —
 * the archive is indexed per system, and that is what stops a Game Boy Advance
 * cartridge being handed the PlayStation 2 box.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim()
    if (!q) return NextResponse.json({ error: 'Missing q' }, { status: 400 })

    let platform = searchParams.get('platform')?.trim() || null

    // Resolve the platform from the game when the caller only knows the id, and
    // prefer the ROM file name over the typed query: it carries the region tag,
    // which decides which of a game's boxes is the right one.
    let fileName: string | null = null
    const gameId = Number(searchParams.get('gameId'))
    if (Number.isFinite(gameId) && gameId > 0) {
      const game = await db.game.findUnique({
        where:  { id: gameId },
        select: { fileName: true, platform: { select: { slug: true } } },
      })
      if (game) {
        platform = platform ?? game.platform.slug
        fileName = game.fileName
      }
    }

    if (!platform) {
      return NextResponse.json({ error: 'Missing platform' }, { status: 400 })
    }
    if (!libretroSupports(platform)) {
      return NextResponse.json(
        {
          error: 'unsupported_platform',
          message: `The libretro archive has no box art for "${platform}".`,
          covers: [],
        },
        { status: 200 },
      )
    }

    // Search both the typed query and the file name, then merge: the query finds
    // a game the operator renamed, the file name finds the exact regional
    // edition. Same entry from both keeps its better score.
    const byQuery = await searchLibretroCovers(q, platform)
    const byFile = fileName ? await searchLibretroCovers(fileName, platform) : []

    const merged = new Map<string, { name: string; url: string; score: number }>()
    for (const c of [...byFile, ...byQuery]) {
      const prev = merged.get(c.url)
      if (!prev || c.score > prev.score) merged.set(c.url, c)
    }

    const covers = [...merged.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      // `thumb` mirrors `url`: these are 256–512 px PNGs already, so there is
      // nothing to downscale and no second request to make.
      .map(c => ({ url: c.url, thumb: c.url, name: c.name, score: c.score }))

    return NextResponse.json({ covers })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
