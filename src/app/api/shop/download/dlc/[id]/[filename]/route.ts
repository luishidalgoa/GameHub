/**
 * GET /api/shop/download/dlc/[id]/[filename]
 * Streams a DLC / update / regional-edition file with Range support.
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

  const dlcId = parseInt(params.id, 10)
  if (isNaN(dlcId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const dlc = await db.gameDlc.findUnique({
    where:  { id: dlcId },
    select: { id: true, gameId: true, filePath: true, type: true, game: { select: { isHidden: true } } },
  })
  if (!dlc || dlc.game.isHidden) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return serveShopFile(req, {
    filePath: dlc.filePath,
    gameId:   dlc.gameId,
    dlcId:    dlc.id,
    dlcType:  dlc.type,
  })
}
