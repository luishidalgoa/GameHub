import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adminGuard } from '@/lib/admin-guard'
import { fetchGameScore } from '@/lib/metadata/scoreChain'
import { getRawgProvider } from '@/lib/metadata/rawg'
import { fetchMetacriticScore } from '@/lib/metadata/metacritic'
import { fetchLaunchBoxRating } from '@/lib/metadata/launchbox'
import { rankScoreCandidates, type ScoreCandidate } from '@/lib/metadata/score-candidates'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function rawgKey(): Promise<string | undefined> {
  const s = await db.setting.findUnique({ where: { key: 'rawg_api_key' } })
  return s?.value || process.env.RAWG_API_KEY || undefined
}

// GET /api/metadata/[id]/score?q=<texto>
// Manual search for the score box: every source is asked for the text the admin
// typed (default: the game's title) and returns candidates, not one answer. The
// admin picks the right one; nothing is saved here. A source that fails does not
// hide the others.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const denied = await adminGuard()
  if (denied) return denied

  const id = parseInt(params.id, 10)
  const game = await db.game.findUnique({
    where: { id },
    select: { title: true, platform: { select: { slug: true } } },
  })
  if (!game || !game.platform) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const query = (new URL(req.url).searchParams.get('q') ?? game.title).trim()
  if (!query) return NextResponse.json({ candidates: [] })

  const candidates: ScoreCandidate[] = []

  const rawg = getRawgProvider(await rawgKey())
  if (rawg) {
    try {
      for (const c of await rawg.searchScores(query)) {
        if (c.metacritic == null) continue
        candidates.push({
          title: c.name,
          releaseYear: c.releaseYear,
          platforms: c.platforms.join(', '),
          score: c.metacritic,
          source: 'metacritic',
        })
      }
    } catch { /* RAWG unavailable: the other sources still answer */ }
  }

  try {
    const mc = await fetchMetacriticScore(query, game.platform.slug)
    if (mc != null) candidates.push({ title: query, releaseYear: null, platforms: '', score: mc, source: 'metacritic' })
  } catch { /* scraper unavailable */ }

  try {
    const lb = await fetchLaunchBoxRating(query, game.platform.slug)
    if (lb != null) candidates.push({ title: query, releaseYear: null, platforms: '', score: lb, source: 'launchbox' })
  } catch { /* LaunchBox unavailable */ }

  return NextResponse.json({ candidates: rankScoreCandidates(candidates, query), query })
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
