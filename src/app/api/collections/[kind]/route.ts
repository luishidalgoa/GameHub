import { NextResponse } from 'next/server'
import { COLLECTION_KINDS, getCollection, type CollectionKind } from '@/lib/home-data'
import { listItemsByIds } from '@/lib/games/list-items'
import { serializeBigInt } from '@/lib/serialize'

export const dynamic = 'force-dynamic'

// GET /api/collections/<kind>?page=&platform=
// Una página de una colección (nuevos, recomendados, descargados, amigos, lanzamientos) en el
// formato de las tarjetas, para la rejilla de scroll infinito de explorar.
export async function GET(req: Request, { params }: { params: { kind: string } }) {
  if (!COLLECTION_KINDS.includes(params.kind as CollectionKind)) {
    return NextResponse.json({ error: 'unknown collection' }, { status: 404 })
  }
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const platform = searchParams.get('platform') || undefined
  const { games, total } = await getCollection(params.kind as CollectionKind, page, platform)
  const items = await listItemsByIds(games.map(g => g.id))
  return NextResponse.json(serializeBigInt({ games: items, total, page }))
}
