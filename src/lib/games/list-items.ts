import { db } from '@/lib/db'
import { resolveCoverPath } from '@/lib/s3'
import { onlineGameIds } from '@/lib/online/flags'
import { libraryGameWhere } from '@/lib/library'
import { backdropUrl } from '@/lib/tile-art'

// Filas de juego en el formato de las tarjetas de la rejilla (el mismo que /api/games), para
// las listas que no son de una sola plataforma: explorar y «recientes». Cada fila lleva el
// slug de su plataforma, porque la tarjeta tiñe su brillo con el color de la consola.
const LIST_ITEM_SELECT = {
  id: true,
  title: true,
  sortTitle: true,
  region: true,
  releaseYear: true,
  genre: true,
  coverPath: true,
  coverUrl: true,
  coverRatio: true,
  logoPath: true,
  backdropPath: true,
  backdropKind: true,
  tilePath: true,
  isFavorite: true,
  isHidden: true,
  platformId: true,
  titleId: true,
  source: true,
  fileSize: true,
  metadataFetchedAt: true,
  fileName: true,
  rawgRating: true,
  rawgMetacritic: true,
  rawgAdded: true,
  rawgScore: true,
  platform: { select: { slug: true } },
} as const

/** Los juegos visibles de esos ids, en el orden dado. Los que no existen o están ocultos se quitan. */
export async function listItemsByIds(ids: number[]) {
  if (ids.length === 0) return []
  const rows = await db.game.findMany({
    where: { AND: [libraryGameWhere(), { id: { in: ids } }] },
    select: LIST_ITEM_SELECT,
  })
  const byId = new Map(rows.map(r => [r.id, r]))
  const ordered = ids.map(id => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r))
  const online = await onlineGameIds(ordered)
  return ordered.map(({ titleId: _titleId, logoPath, backdropPath, backdropKind, tilePath, platform, platformId: _platformId, ...g }) => ({
    ...g,
    platformSlug: platform.slug,
    coverPath: resolveCoverPath(g.coverPath),
    logo: resolveCoverPath(logoPath),
    backdrop: backdropUrl({ backdropPath, backdropKind, tilePath, coverPath: g.coverPath, coverUrl: g.coverUrl }),
    online: online.has(g.id),
  }))
}
