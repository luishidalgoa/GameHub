import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computePopularityScore, MIN_ADDED } from '@/lib/metadata/popularity'

export const dynamic = 'force-dynamic'

// GET /api/games/random → { id } of a non-hidden game.
// When popularity data exists, the pick is WEIGHTED by the popularity score
// (good games surface more often). Otherwise it's a uniform random pick — so it
// always works, even before the popularity sync has run.
export async function GET() {
  // Try the weighted pool first.
  const pool = await db.game.findMany({
    where: { isHidden: false, rawgAdded: { gte: MIN_ADDED } },
    select: { id: true, rawgAdded: true, rawgRating: true, rawgMetacritic: true },
    take: 500,
    orderBy: { rawgAdded: 'desc' },
  })

  if (pool.length > 0) {
    const weights = pool.map(g => Math.max(0.01, computePopularityScore(g)))
    const total = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i]
      if (r <= 0) return NextResponse.json({ id: pool[i].id })
    }
    return NextResponse.json({ id: pool[pool.length - 1].id })
  }

  // Fallback: uniform random over all visible games.
  const count = await db.game.count({ where: { isHidden: false } })
  if (count === 0) return NextResponse.json({ error: 'No games' }, { status: 404 })
  const skip = Math.floor(Math.random() * count)
  const game = await db.game.findFirst({ where: { isHidden: false }, skip, select: { id: true } })
  if (!game) return NextResponse.json({ error: 'No games' }, { status: 404 })
  return NextResponse.json({ id: game.id })
}
