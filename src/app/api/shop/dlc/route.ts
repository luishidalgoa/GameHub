/**
 * GET /api/shop/dlc
 * Sub-index listing only DLC files — navigable as a directory in CyberFoil.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardShopRequest, shopBaseUrl } from '@/lib/shop-auth'
import { isSwitchFile, shopFileName, statSize } from '@/lib/shop-files'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const denied = await guardShopRequest(req)
  if (denied) return denied

  const dlcs = await db.gameDlc.findMany({
    where: { type: 'dlc', game: { isHidden: false } },
    // Solo el titleId PROPIO del DLC. Nada de heredar el del juego: el id base
    // significa "esto es el juego", asi que un DLC servido con el sale
    // clasificado como juego y aparece en la rejilla al lado del suyo, que es
    // justo el sintoma que estamos arreglando. Un DLC sin id queda sin
    // emparejar, y eso ya lo cubre la consola escondiendo lo que viene de un
    // sub-indice.
    select: { id: true, filePath: true, fileName: true, titleId: true },
  })

  const base = shopBaseUrl(req)
  const switchDlcs = dlcs.filter((d) => isSwitchFile(d.fileName))
  const sizes = await statSize(switchDlcs.map((d) => d.filePath))

  const files = switchDlcs
    .map((d, i) => ({
      url:  `${base}/api/shop/download/dlc/${d.id}/${encodeURIComponent(
              shopFileName(d.fileName, d.titleId))}`,
      size: sizes[i],
    }))
    .filter((f): f is { url: string; size: number } => f.size !== null && f.size > 0)

  return NextResponse.json({
    files,
    success: `GameHub DLC · ${files.length} items`,
  })
}
