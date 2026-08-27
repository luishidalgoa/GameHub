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
    select: { id: true, filePath: true, fileName: true, titleId: true,
              gameId: true },
  })

  const base = shopBaseUrl(req)
  const switchDlcs = dlcs.filter((d) => isSwitchFile(d.fileName))
  const sizes = await statSize(switchDlcs.map((d) => d.filePath))

  // gh_id dice de QUE juego es este DLC, y gh_kind que clase de complemento es.
  // Los dos salen de la base de datos, que lo sabe desde el escaneo: GameDlc
  // tiene su gameId. Antes la consola tenia que deducirlo comparando Title IDs
  // sacados del nombre del fichero, y un nombre sin id dejaba al complemento
  // huerfano -- o peor, disfrazado de juego en la rejilla.
  // Se descarta por tamano ANTES de construir la fila: el predicado de tipo
  // tiene que describir el objeto entero, y cada clave gh_ nueva obligaria a
  // repetirla ahi. Filtrando primero, la fila se escribe una sola vez.
  const files = switchDlcs
    .map((d, i) => ({ dlc: d, size: sizes[i] }))
    .filter((x): x is { dlc: (typeof switchDlcs)[number]; size: number } =>
      x.size !== null && x.size > 0)
    .map(({ dlc, size }) => ({
      url:  `${base}/api/shop/download/dlc/${dlc.id}/${encodeURIComponent(
              shopFileName(dlc.fileName, dlc.titleId))}`,
      size,
      gh_id:   dlc.gameId,
      gh_kind: 'dlc',
    }))

  return NextResponse.json({
    files,
    success: `GameHub DLC · ${files.length} items`,
  })
}
