/**
 * GET /api/shop/game/<id>
 * Ficha de un juego: lo que hace falta para decidir ANTES de descargar.
 *
 * Por que un endpoint aparte y no mas claves en el indice: el indice de una
 * plataforma trae una fila por fichero --gba son 1028-- y una descripcion son
 * entre 500 y 2000 caracteres. Pegarlas ahi multiplicaria por diez el peso de
 * algo que la consola pide entero por WiFi cada vez que abre la plataforma,
 * para ensenar un dato que solo se mira de uno en uno. El indice se queda
 * ligero y esto se pide cuando se abre la ficha.
 *
 * Sirve para CUALQUIER plataforma, y ese es el arreglo de fondo. Hasta ahora la
 * metadata rica solo salia dentro del mapa `titledb` de /api/shop, que va
 * indexado por Title ID de Switch: una ROM no tiene, asi que se quedaba sin
 * descripcion, sin capturas y sin trailer aunque estuvieran en la base de datos.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardShopRequest, shopBaseUrl } from '@/lib/shop-auth'
import { parseScreenshots, shopFileName, statSize } from '@/lib/shop-files'
import { jpegImageUrl } from '@/lib/cover-url'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const denied = await guardShopRequest(req)
  if (denied) return denied

  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json({ error: 'Bad game id' }, { status: 400 })

  const game = await db.game.findUnique({
    where: { id },
    select: {
      id: true, title: true, fileName: true, filePath: true, titleId: true,
      description: true, releaseYear: true, genre: true, publisher: true,
      developer: true, region: true, languages: true,
      coverPath: true, coverUrl: true, trailerUrl: true,
      screenshotPaths: true, isHidden: true,
      platform: { select: { slug: true, name: true } },
      dlcs: {
        select: { id: true, fileName: true, filePath: true, title: true,
                  type: true, region: true, languages: true },
      },
    },
  })

  // Un juego escondido se responde como inexistente, igual que una plataforma
  // apagada: que este en la base de datos es asunto del administrador.
  if (!game || game.isHidden)
    return NextResponse.json({ error: 'Unknown game' }, { status: 404 })

  const base = shopBaseUrl(req)

  // El fichero base primero y sus complementos detras, en una sola lista. La
  // consola no tiene que saber que unos salen de Game y otros de GameDlc: lo
  // que necesita es que se puede descargar y de que clase es.
  //
  // Para Switch el nombre servido lleva el Title ID pegado si el del disco no
  // lo trae, como en el indice: de ese segmento sale la identidad del fichero.
  type Candidate = {
    path: string
    row: {
      url: string
      gh_kind: string
      gh_title?: string
      gh_region?: string
      gh_languages?: string
    }
  }
  const candidates: Candidate[] = [{
    path: game.filePath,
    row: {
      url: `${base}/api/shop/download/${game.id}/` +
           encodeURIComponent(shopFileName(game.fileName, game.titleId)),
      gh_kind: 'base',
      ...(game.title ? { gh_title: game.title } : {}),
      ...(game.region ? { gh_region: game.region } : {}),
      ...(game.languages ? { gh_languages: game.languages } : {}),
    },
  }]
  for (const dlc of game.dlcs) {
    candidates.push({
      path: dlc.filePath,
      row: {
        url: `${base}/api/shop/download/dlc/${dlc.id}/` +
             encodeURIComponent(dlc.fileName),
        gh_kind: dlc.type,
        ...(dlc.title ? { gh_title: dlc.title } : {}),
        ...(dlc.region ? { gh_region: dlc.region } : {}),
        ...(dlc.languages ? { gh_languages: dlc.languages } : {}),
      },
    })
  }

  // El tamano sale del disco, nunca de la base de datos, y lo que no se puede
  // medir no se publica: misma regla que los indices. Ofrecer una descarga que
  // no esta es peor que no ofrecerla.
  const sizes = await statSize(candidates.map((c) => c.path))
  const files = candidates
    .map((c, i) => ({ ...c.row, size: sizes[i] }))
    .filter((f): f is typeof f & { size: number } =>
      f.size !== null && f.size > 0)

  // Las capturas se sirven SIEMPRE desde este dominio, aunque por dentro sean
  // externas. GameHubNX solo acepta imagenes de su propio servidor, y muchas
  // capturas se guardan como URL del proveedor de metadata
  // (images.launchbox-app.com): tal cual, la consola las rechazaba y la ficha
  // salia sin ninguna. Las portadas no tenian el problema porque el trabajo de
  // metadata se las descarga a S3.
  const shots = parseScreenshots(game.screenshotPaths)
    .map((_, i) => `${base}/api/shop/game/${game.id}/shot/${i}`)

  return NextResponse.json({
    gh_id: game.id,
    gh_platform: game.platform.slug,
    gh_platform_name: game.platform.name,
    gh_title: game.title,
    ...(game.coverPath || game.coverUrl
      ? { gh_cover: jpegImageUrl(base, game.coverPath, game.coverUrl) }
      : {}),
    ...(game.description ? { gh_description: game.description } : {}),
    ...(shots.length > 0 ? { gh_screenshots: shots } : {}),
    ...(game.trailerUrl ? { gh_trailer: game.trailerUrl } : {}),
    ...(game.developer ? { gh_developer: game.developer } : {}),
    ...(game.publisher ? { gh_publisher: game.publisher } : {}),
    ...(game.genre ? { gh_genre: game.genre } : {}),
    ...(game.releaseYear ? { gh_year: game.releaseYear } : {}),
    ...(game.region ? { gh_region: game.region } : {}),
    ...(game.languages ? { gh_languages: game.languages } : {}),
    files,
    success: `GameHub · ${game.title}`,
  })
}
