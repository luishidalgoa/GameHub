import { NextResponse } from 'next/server'
import { getTilesByIds } from '@/lib/home-data'

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

  // The same tiles the grids draw (cover, platform, ratio), so the recent page can use them as they are.
  return NextResponse.json({ games: await getTilesByIds(ids) })
}
