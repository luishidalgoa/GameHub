import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET — how far the image repository is: games by art status, games with stored
// images, and images stored. Read by the art panel while the job runs.
export async function GET() {
  const denied = await adminGuard()
  if (denied) return denied

  const [byStatus, images, gamesWithImages] = await Promise.all([
    db.game.groupBy({ by: ['artStatus'], where: { isHidden: false }, _count: { _all: true } }),
    db.gameImage.count(),
    db.gameImage.findMany({ distinct: ['gameId'], select: { gameId: true } }),
  ])
  const status: Record<string, number> = {}
  for (const row of byStatus) status[row.artStatus ?? 'pendiente'] = row._count._all
  return NextResponse.json({ status, images, gamesWithImages: gamesWithImages.length })
}
