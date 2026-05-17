import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getRawgProvider } from '@/lib/metadata/rawg'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const gameId = parseInt(params.id, 10)

  const [game, setting] = await Promise.all([
    db.game.findUnique({ where: { id: gameId }, select: { rawgSlug: true } }),
    db.setting.findUnique({ where: { key: 'rawg_api_key' } }),
  ])

  if (!game?.rawgSlug) return NextResponse.json({ screenshots: [] })

  const provider = getRawgProvider(setting?.value)
  if (!provider) return NextResponse.json({ screenshots: [] })

  const screenshots = await provider.fetchScreenshots(game.rawgSlug).catch(() => [])
  return NextResponse.json({ screenshots })
}
