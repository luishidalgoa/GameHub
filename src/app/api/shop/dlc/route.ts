/**
 * GET /api/shop/dlc
 * Sub-index listing only DLC files — navigable as a directory in CyberFoil.
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

  const dlcs = await db.gameDlc.findMany({
    where: { type: 'dlc', game: { isHidden: false } },
    select: { id: true, filePath: true, fileName: true },
  })

  const base = shopBaseUrl(req)
  const switchDlcs = dlcs.filter((d) => isSwitchFile(d.fileName))
  const sizes = await statSize(switchDlcs.map((d) => d.filePath))

  const files = switchDlcs
    .map((d, i) => ({
      url:  `${base}/api/shop/download/dlc/${d.id}/${encodeURIComponent(d.fileName)}`,
      size: sizes[i],
    }))
    .filter((f): f is { url: string; size: number } => f.size !== null && f.size > 0)

  return NextResponse.json({
    files,
    success: `GameHub DLC · ${files.length} items`,
  })
}
