import { NextResponse } from 'next/server'
import { listItemsByIds } from '@/lib/games/list-items'
import { serializeBigInt } from '@/lib/serialize'

export const dynamic = 'force-dynamic'

// GET /api/games/list?ids=1,2,3
// Los juegos de esos ids en el formato de las tarjetas, en el orden pedido. Lo usa la rejilla de
// «recientes», que guarda su lista de ids en el navegador. Solo juegos visibles; el resto se omite.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const ids = (searchParams.get('ids') ?? '')
    .split(',')
    .map(s => parseInt(s, 10))
    .filter(n => Number.isFinite(n))
    .slice(0, 100)
  return NextResponse.json(serializeBigInt({ games: await listItemsByIds(ids), total: ids.length }))
}
