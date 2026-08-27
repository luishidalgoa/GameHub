/**
 * GET /api/shop/updates
 * Sub-index listing only update patches — navigable as a directory in CyberFoil.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardShopRequest, shopBaseUrl } from '@/lib/shop-auth'
import { isSwitchFile, shopFileName, statSize } from '@/lib/shop-files'

/** Title ID de la actualizacion de un juego: el suyo con 0x800 puesto. */
function updateTitleId(baseTitleId: string | null): string | null {
  if (!baseTitleId || !/^[0-9a-fA-F]{16}$/.test(baseTitleId)) return null
  const value = BigInt('0x' + baseTitleId)
  const base  = value & ~BigInt(0x1fff)
  return (base | BigInt(0x800)).toString(16).toUpperCase().padStart(16, '0')
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const denied = await guardShopRequest(req)
  if (denied) return denied

  const updates = await db.gameDlc.findMany({
    where: { type: 'update', game: { isHidden: false } },
    // El Title ID de una actualizacion es el del juego con los bits 0x800
    // puestos; si el fichero no lo trae en el nombre, la consola no sabe de que
    // juego es y lo acaba pintando como un juego suelto. Se sirve el propio si
    // esta, y si no se deriva del juego.
    select: { id: true, filePath: true, fileName: true, titleId: true,
              gameId: true, game: { select: { titleId: true } } },
  })

  const base = shopBaseUrl(req)
  const switchUpdates = updates.filter((u) => isSwitchFile(u.fileName))
  const sizes = await statSize(switchUpdates.map((u) => u.filePath))

  // Filtrar por tamano antes de construir la fila; ver la nota en /api/shop/dlc.
  const files = switchUpdates
    .map((u, i) => ({ upd: u, size: sizes[i] }))
    .filter((x): x is { upd: (typeof switchUpdates)[number]; size: number } =>
      x.size !== null && x.size > 0)
    .map(({ upd, size }) => ({
      url:  `${base}/api/shop/download/dlc/${upd.id}/${encodeURIComponent(
              shopFileName(upd.fileName,
                           upd.titleId ?? updateTitleId(upd.game.titleId)))}`,
      size,
      // De que juego es, dicho y no deducido. Ver la nota en /api/shop/dlc.
      gh_id:   upd.gameId,
      gh_kind: 'update',
    }))

  return NextResponse.json({
    files,
    success: `GameHub Updates · ${files.length} items`,
  })
}
