/**
 * GET /api/shop/updates
 * Sub-index listing only update patches — navigable as a directory in CyberFoil.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardShopRequest, shopBaseUrl } from '@/lib/shop-auth'
import { isSwitchFile, statSize } from '@/lib/shop-files'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const denied = await guardShopRequest(req)
  if (denied) return denied

  const updates = await db.gameDlc.findMany({
    where: { type: 'update', game: { isHidden: false } },
    select: { id: true, filePath: true, fileName: true },
  })

  const base = shopBaseUrl(req)
  const switchUpdates = updates.filter((u) => isSwitchFile(u.fileName))
  const sizes = await statSize(switchUpdates.map((u) => u.filePath))

  const files = switchUpdates
    .map((u, i) => ({
      url:  `${base}/api/shop/download/dlc/${u.id}/${encodeURIComponent(u.fileName)}`,
      size: sizes[i],
    }))
    .filter((f): f is { url: string; size: number } => f.size !== null && f.size > 0)

  return NextResponse.json({
    files,
    success: `GameHub Updates · ${files.length} items`,
  })
}
