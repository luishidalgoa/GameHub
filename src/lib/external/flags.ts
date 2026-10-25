import { db } from '@/lib/db'
import { cachedAggregate } from '@/lib/aggregate-cache'
import { extractSwitchTitleId } from '@/lib/scanner/titleid'
import { titleKey } from './match'

/** Title IDs y claves de nombre que tienen torrent, por plataforma. Se cachea 10 min. */
async function torrentKeys(): Promise<Set<string>> {
  const rows = await cachedAggregate('external:keys', 10 * 60_000, () =>
    db.externalGame.findMany({ select: { platformId: true, titleId: true, titleKey: true } }))
  const keys = new Set<string>()
  for (const r of rows) {
    if (r.titleId) keys.add(`${r.platformId}|id|${r.titleId}`)
    if (r.titleKey.length >= 4) keys.add(`${r.platformId}|key|${r.titleKey}`)
  }
  return keys
}

/**
 * Ids de los juegos de la biblioteca que tienen torrent: casan por el Title ID del nombre de
 * fichero (o el guardado a mano) o por el nombre, la misma regla que la vista Torrent.
 */
export async function torrentGameIds(
  games: { id: number; title: string; fileName: string; titleId: string | null; platformId: number }[],
): Promise<Set<number>> {
  const known = await torrentKeys()
  const out = new Set<number>()
  for (const g of games) {
    const id = extractSwitchTitleId(g.fileName) ?? g.titleId?.toUpperCase()
    const key = titleKey(g.title)
    if ((id && known.has(`${g.platformId}|id|${id}`)) || (key.length >= 4 && known.has(`${g.platformId}|key|${key}`))) {
      out.add(g.id)
    }
  }
  return out
}
