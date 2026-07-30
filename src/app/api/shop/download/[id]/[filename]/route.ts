/**
 * GET /api/shop/download/[id]/[filename]
 * Streams a base game file with full Range request support (pause/resume).
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardShopRequest } from '@/lib/shop-auth'
import { serveShopFile } from '@/lib/shop-download'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  req: Request,
  { params }: { params: { id: string; filename: string } },
) {
  const denied = await guardShopRequest(req)
  if (denied) return denied

  const gameId = parseInt(params.id, 10)
  if (isNaN(gameId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const game = await db.game.findUnique({
    where:  { id: gameId },
    select: { filePath: true, isHidden: true },
  })
  // Hidden games are absent from the index; don't serve them by direct id either.
  if (!game || game.isHidden) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return serveShopFile(req, { filePath: game.filePath })
}
