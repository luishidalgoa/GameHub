import { db } from '@/lib/db'
import { cachedAggregate } from '@/lib/aggregate-cache'
import { extractSwitchTitleId } from '@/lib/scanner/titleid'

/** Title IDs que tienen torrent en alguna fuente, por plataforma. Se cachea 10 min. */
async function torrentTitleIds(): Promise<Set<string>> {
  const rows = await cachedAggregate('external:title-ids', 10 * 60_000, () =>
    db.externalGame.findMany({ where: { titleId: { not: null } }, select: { platformId: true, titleId: true } }))
  return new Set(rows.map(r => `${r.platformId}|${r.titleId}`))
}

/**
 * Ids de los juegos de la biblioteca que tienen torrent. Casan por el Title ID del nombre de
 * fichero (o el guardado a mano), igual que la tienda.
 */
export async function torrentGameIds(
  games: { id: number; fileName: string; titleId: string | null; platformId: number }[],
): Promise<Set<number>> {
  const known = await torrentTitleIds()
  const out = new Set<number>()
  for (const g of games) {
    const id = extractSwitchTitleId(g.fileName) ?? g.titleId?.toUpperCase()
    if (id && known.has(`${g.platformId}|${id}`)) out.add(g.id)
  }
  return out
}
