/**
 * GET /api/shop
 *
 * CyberFoil / Tinfoil-compatible HTTP shop index.
 * LAN-only. Optional Basic Auth via the `shop_password` DB setting — see
 * `lib/shop-auth.ts` for both gates.
 *
 * Response shape:
 *   files      – downloadable NSP/NSZ/XCI files (base games + regional editions)
 *   directories– sub-indexes (DLC, updates)
 *   titledb    – optional rich metadata keyed by Nintendo Title ID
 *   files[].gh_id      – id del juego en GameHub. Lo mismo en los sub-índices,
 *                apuntando al juego del que el complemento forma parte: así el
 *                cliente NO tiene que deducir la relación comparando Title IDs
 *                sacados del nombre del fichero. El servidor ya la conoce.
 *   files[].gh_cover / gh_title – portada y título por fichero, para que no
 *                dependan de tener entrada en el titledb (que va indexado por
 *                Title ID y por tanto por el nombre del fichero)
 *   gh_cover_width / gh_cover_height – proporción de portada de la plataforma
 *                Switch, para que la app pinte la caja con la forma que el
 *                usuario configuró aquí en vez de con una constante suya
 *   success    – message shown in the app UI
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardShopRequest, shopBaseUrl } from '@/lib/shop-auth'
import { extractSwitchTitleId } from '@/lib/scanner/titleid'
import { resolveCoverPath } from '@/lib/cover-url'

/**
 * screenshotPaths is a JSON-encoded string array. A malformed value costs a
 * carousel, never the whole shop index, so parse failures fall back to none.
 */
function parseScreenshots(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)
  } catch {
    return []
  }
}
import { isSwitchFile, shopFileName, statSize } from '@/lib/shop-files'

/**
 * URL de portada que la consola puede decodificar.
 *
 * En JPEG a proposito: GameHubNX decodifica con stb_image, que no entiende
 * WebP. Devuelve null cuando el juego no tiene ninguna.
 */
function coverJpegUrl(base: string, coverPath: string | null,
                      coverUrl: string | null): string | undefined {
  const cover = resolveCoverPath(coverPath) ?? coverUrl ?? null
  if (!cover) return undefined
  const absolute = cover.startsWith('/') ? `${base}${cover}` : cover
  return absolute + (absolute.includes('?') ? '&' : '?') + 'fmt=jpg'
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const denied = await guardShopRequest(req)
  if (denied) return denied

  const games = await db.game.findMany({
    where: { isHidden: false },
    select: {
      id:          true,
      filePath:    true,
      fileName:    true,
      titleId:     true,
      title:       true,
      description: true,
      releaseYear: true,
      genre:       true,
      publisher:   true,
      coverPath:   true,
      coverUrl:    true,
      // Campos que solo consume GameHubNX (claves gh_ del titledb).
      region:          true,
      developer:       true,
      languages:       true,
      trailerUrl:      true,
      groupKey:        true,
      screenshotPaths: true,
      dlcs: {
        select: { id: true, filePath: true, fileName: true, type: true, region: true,
                  titleId: true },
      },
    },
  })

  const base = shopBaseUrl(req)

  // Candidates: the base game file plus every alternate regional edition (stored
  // as GameDlc rows with type 'region' since 2.6.0 — they are full base games in
  // another region, so they belong in the main index, not in a sub-directory).
  type Candidate = {
    url:      string
    filePath: string
    fileName: string
    gameId:   number
    game:     (typeof games)[number]
    region:   string | null
  }

  // `fileName` de aqui en adelante es el nombre SERVIDO, no el del disco: si el
  // del disco no trae el Title ID y la base de datos si lo sabe, se le pega.
  // De ese segmento de URL sale todo lo demas --la clave del titledb, y por
  // tanto la caratula-- porque es lo unico que la consola llega a leer.
  const candidates: Candidate[] = []
  for (const g of games) {
    if (isSwitchFile(g.fileName)) {
      const served = shopFileName(g.fileName, g.titleId)
      candidates.push({
        url:      `${base}/api/shop/download/${g.id}/${encodeURIComponent(served)}`,
        filePath: g.filePath,
        fileName: served,
        gameId:   g.id,
        game:     g,
        region:   null,
      })
    }
    for (const d of g.dlcs) {
      if (d.type !== 'region' || !isSwitchFile(d.fileName)) continue
      // Una edicion regional es un juego base completo: si no trae Title ID
      // propio hereda el del juego, que es el mismo titulo en otra region.
      const served = shopFileName(d.fileName, d.titleId ?? g.titleId)
      candidates.push({
        url:      `${base}/api/shop/download/dlc/${d.id}/${encodeURIComponent(served)}`,
        filePath: d.filePath,
        fileName: served,
        gameId:   g.id,
        game:     g,
        region:   d.region,
      })
    }
  }

  // Size comes from the file on disk, never from the DB: a ROM replaced without
  // a rescan would otherwise be advertised (and streamed) with a stale length,
  // which the console sees as a corrupt install. A null size means unreadable /
  // missing — e.g. an offline network share — so the title is simply not listed.
  const sizes = await statSize(candidates.map((c) => c.filePath))
  const available = candidates
    .map((c, i) => ({ ...c, size: sizes[i] }))
    .filter((c): c is Candidate & { size: number } => c.size !== null && c.size > 0)

  // Cada fichero lleva su identidad de GameHub y su portada AQUI, no solo en el
  // titledb. El titledb va indexado por Title ID --formato Tinfoil-- y ese id
  // sale del nombre del fichero, asi que un volcado mal nombrado se quedaba sin
  // entrada y por tanto sin caratula, aunque GameHub tuviera la portada
  // guardada. gh_id es lo mismo que gh_cover: un dato que el servidor ya tiene
  // y que antes obligaba al cliente a deducir.
  //
  // Tinfoil y CyberFoil ignoran las claves que no conocen, asi que esto no les
  // afecta; el titledb se sigue publicando igual para ellos.
  const files = available.map((c) => ({
    url:  c.url,
    size: c.size,
    gh_id: c.gameId,
    ...(c.game.coverPath || c.game.coverUrl
      ? { gh_cover: coverJpegUrl(base, c.game.coverPath, c.game.coverUrl) }
      : {}),
    ...(c.game.title ? { gh_title: c.game.title } : {}),
  }))

  // ── titledb (rich metadata for CyberFoil / Tinfoil eShop display) ─────────
  const titledb: Record<string, object> = {}
  for (const c of available) {
    const titleId = extractSwitchTitleId(c.fileName)
    if (!titleId) continue
    // Two files can carry the same Title ID (same game, different dump). Keep the
    // first instead of letting the last one silently win.
    if (titledb[titleId]) continue

    const cover = resolveCoverPath(c.game.coverPath) ?? c.game.coverUrl ?? null
    const coverUrl = cover?.startsWith('/') ? `${base}${cover}` : cover
    const coverJpeg = coverJpegUrl(base, c.game.coverPath, c.game.coverUrl)

    const shots = parseScreenshots(c.game.screenshotPaths)
      .map((p) => (p.startsWith('/') ? `${base}${p}` : p))

    titledb[titleId] = {
      id:          titleId,
      name:        c.region ? `${c.game.title} (${c.region})` : c.game.title,
      description: c.game.description ?? '',
      // Only the release year is known; Tinfoil wants an int date, so this is
      // January 1st of that year — a placeholder day, not a real release date.
      releaseDate: c.game.releaseYear ? c.game.releaseYear * 10000 + 101 : undefined,
      category:    c.game.genre ? [c.game.genre] : undefined,
      publisher:   c.game.publisher ?? undefined,
      size:        c.size,
      ...(coverUrl ? { iconUrl: coverUrl, bannerUrl: coverUrl } : {}),
      
      // ── Extension propia para GameHubNX ─────────────────────────────────
      // Tinfoil y CyberFoil ignoran las claves que no conocen, asi que esto
      // enriquece nuestra app sin romperles nada. El prefijo gh_ deja claro
      // que no forma parte del formato y evita chocar con claves que Tinfoil
      // pueda anadir mas adelante.
      //
      // `name` lleva la region pegada al titulo porque Tinfoil solo tiene ese
      // campo; gh_title y gh_region van sueltos para que la ficha los maquete
      // como quiera.
      // La portada, pero en JPEG: GameHubNX decodifica con stb_image, que no
      // entiende WebP y dejaba las fichas sin imagen. iconUrl y bannerUrl se
      // quedan como estan porque los lee CyberFoil, que si lo soporta.
      ...(coverJpeg ? { gh_cover: coverJpeg } : {}),
      gh_title:      c.game.title,
      // c.region es la region del FICHERO (deducida del nombre) y casi siempre
      // viene vacia; la del juego esta poblada en 1.802 de 2.058 filas. Sin
      // este respaldo la app no recibia region en NINGUNA entrada.
      ...((c.region ?? c.game.region)
        ? { gh_region: c.region ?? c.game.region }
        : {}),
      ...(c.game.languages   ? { gh_languages:   c.game.languages }   : {}),
      ...(c.game.developer   ? { gh_developer:   c.game.developer }   : {}),
      ...(c.game.releaseYear ? { gh_year:        c.game.releaseYear } : {}),
      ...(c.game.trailerUrl  ? { gh_trailer:     c.game.trailerUrl }  : {}),
      ...(c.game.groupKey    ? { gh_group:       c.game.groupKey }    : {}),
      ...(shots.length > 0
        ? { gh_screenshots: shots.map((u) => u + (u.includes('?') ? '&' : '?') + 'fmt=jpg') }
        : {}),
    }
  }

  // ── directories: separate DLC and update sub-indexes ─────────────────────
  // Announced from DB rows only (no per-file stat — that is the sub-index's job).
  // Restricted to visible games so a hidden library doesn't advertise a folder
  // that then lists nothing.
  const extras   = games.flatMap((g) => g.dlcs)
  const hasDlc     = extras.some((d) => d.type === 'dlc'    && isSwitchFile(d.fileName))
  const hasUpdates = extras.some((d) => d.type === 'update' && isSwitchFile(d.fileName))

  const directories: string[] = []
  if (hasDlc)     directories.push(`${base}/api/shop/dlc`)
  if (hasUpdates) directories.push(`${base}/api/shop/updates`)

  // ── proporción de portada ────────────────────────────────────────────────
  // El tamaño de miniatura es una preferencia POR PLATAFORMA (200x300 en Switch,
  // 200x140 en SNES…) y hasta ahora se quedaba en la web: el índice no lo
  // publicaba, así que GameHubNX no tenía forma de saberla y pintaba las cajas
  // con una constante propia, calibrada para otro catálogo. Esta tienda solo
  // sirve Switch, así que basta con una pareja de valores en la raíz.
  //
  // Se omiten si la plataforma no existe: una clave ausente deja a la app en su
  // valor por defecto, que es exactamente el comportamiento de antes.
  const switchPlatform = await db.platform.findUnique({
    where:  { slug: 'switch' },
    select: { thumbnailWidth: true, thumbnailHeight: true },
  })
  const cover =
    switchPlatform && switchPlatform.thumbnailWidth > 0 &&
    switchPlatform.thumbnailHeight > 0
      ? {
          gh_cover_width:  switchPlatform.thumbnailWidth,
          gh_cover_height: switchPlatform.thumbnailHeight,
        }
      : {}

  return NextResponse.json({
    files,
    directories,
    ...(Object.keys(titledb).length > 0 && { titledb }),
    ...cover,
    success: `GameHub · ${files.length} titles`,
  })
}
