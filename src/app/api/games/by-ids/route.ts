import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveCoverPath } from '@/lib/s3'

export const dynamic = 'force-dynamic'

// GET /api/games/by-ids?ids=1,2,3
// Returns the (visible) games for a list of ids — used by the client-side
// "recently viewed" page, which holds the id list in localStorage. Unordered;
// the caller reorders by its own list. Public (catalog read, no secrets).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const ids = (searchParams.get('ids') ?? '')
    .split(',')
    .map(s => parseInt(s, 10))
    .filter(n => Number.isFinite(n))
    .slice(0, 100)

  if (ids.length === 0) return NextResponse.json({ games: [] })

  const games = await db.game.findMany({
    where: { id: { in: ids }, isHidden: false },
    select: {
      id: true, title: true, coverPath: true, coverUrl: true, releaseYear: true,
      platform: { select: { slug: true, name: true, thumbnailWidth: true, thumbnailHeight: true } },
    },
  })

  const resolved = games.map(g => ({ ...g, coverPath: resolveCoverPath(g.coverPath) }))
  return NextResponse.json({ games: resolved })
}
