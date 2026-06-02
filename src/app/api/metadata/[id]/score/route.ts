import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchMetacriticScore } from '@/lib/metadata/metacritic'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// POST /api/metadata/[id]/score
// Scrapes Metacritic for THIS game's score (by its DB title + platform) and
// returns it WITHOUT saving — the editor lets the admin review/edit before
// saving. Protected by the middleware's POST /api/metadata pattern.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  const game = await db.game.findUnique({
    where: { id },
    select: { title: true, platform: { select: { slug: true } } },
  })
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const score = await fetchMetacriticScore(game.title, game.platform?.slug)
    return NextResponse.json({ score })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lookup failed' },
      { status: 500 },
    )
  }
}
