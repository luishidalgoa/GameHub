import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchGameScore } from '@/lib/metadata/scoreChain'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function rawgKey(): Promise<string | undefined> {
  const s = await db.setting.findUnique({ where: { key: 'rawg_api_key' } })
  return s?.value || process.env.RAWG_API_KEY || undefined
}

// POST /api/metadata/[id]/score
// Runs the centralized score chain (RAWG metacritic → Metacritic → LaunchBox)
// for THIS game and returns the score WITHOUT saving — the editor lets the admin
// review/edit before saving. Protected by the middleware's POST /api/metadata.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  const game = await db.game.findUnique({
    where: { id },
    select: { title: true, rawgId: true, platform: { select: { slug: true } } },
  })
  if (!game || !game.platform) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const r = await fetchGameScore({
      title: game.title,
      platformSlug: game.platform.slug,
      rawgId: game.rawgId,
      apiKey: await rawgKey(),
    })
    return NextResponse.json({ score: r?.score ?? null, source: r?.source ?? null })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lookup failed' },
      { status: 500 },
    )
  }
}
