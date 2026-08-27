/**
 * GET /api/shop/platform/<slug>
 * Indice de una plataforma que NO es Switch: ficheros que un emulador abre.
 *
 * Misma forma que /api/shop y sus sub-indices --files[] con url, size y las
 * claves gh_*-- para que el cliente los parsee con el mismo codigo. La
 * diferencia no esta en el formato sino en lo que significan: aqui nada se
 * instala en la consola, asi que no hay Title ID, ni titledb, ni
 * actualizaciones, ni DLC.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardShopRequest, shopBaseUrl } from '@/lib/shop-auth'
import { matchesExtensions, platformExtensions, statSize } from '@/lib/shop-files'
import { jpegImageUrl } from '@/lib/cover-url'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'


export async function GET(
  req: Request,
  { params }: { params: { slug: string } },
) {
  const denied = await guardShopRequest(req)
  if (denied) return denied

  const platform = await db.platform.findUnique({
    where:  { slug: params.slug },
    select: {
      slug: true, name: true, extensions: true, enabled: true,
      thumbnailWidth: true, thumbnailHeight: true,
      games: {
        where:  { isHidden: false },
        select: { id: true, title: true, fileName: true, filePath: true,
                  coverPath: true, coverUrl: true },
      },
    },
  })

  // Una plataforma apagada se responde como inexistente a proposito: que este
  // en la base de datos es asunto del administrador, no del cliente.
  if (!platform || !platform.enabled)
    return NextResponse.json({ error: 'Unknown platform' }, { status: 404 })

  const base = shopBaseUrl(req)
  const exts = platformExtensions(platform.extensions)
  const games = platform.games.filter((g) => matchesExtensions(g.fileName, exts))

  // El tamano sale del fichero en disco, nunca de la base de datos, y lo que no
  // se puede medir no se publica: misma regla que el indice de Switch. Aqui el
  // motivo es otro --una ROM a medias no corrompe una instalacion-- pero
  // anunciar algo que no se puede servir sigue siendo mentir.
  const sizes = await statSize(games.map((g) => g.filePath))
  const files = games
    .map((game, i) => ({ game, size: sizes[i] }))
    .filter((x): x is { game: (typeof games)[number]; size: number } =>
      x.size !== null && x.size > 0)
    .map(({ game, size }) => ({
      // El ultimo segmento es el nombre real del fichero, con su extension:
      // el cliente la necesita para saber en que carpeta del emulador dejarlo.
      // No se le inyecta ningun id como en Switch, porque aqui no hay titledb
      // que cruzar.
      url:  `${base}/api/shop/download/${game.id}/${encodeURIComponent(game.fileName)}`,
      size,
      gh_id:   game.id,
      gh_kind: 'rom',
      ...(game.title ? { gh_title: game.title } : {}),
      ...(game.coverPath || game.coverUrl
        ? { gh_cover: jpegImageUrl(base, game.coverPath, game.coverUrl) }
        : {}),
    }))

  return NextResponse.json({
    files,
    gh_platform: platform.slug,
    gh_platform_name: platform.name,
    ...(platform.thumbnailWidth > 0 && platform.thumbnailHeight > 0
      ? { gh_cover_width: platform.thumbnailWidth,
          gh_cover_height: platform.thumbnailHeight }
      : {}),
    success: `GameHub ${platform.name} · ${files.length} items`,
  })
}
