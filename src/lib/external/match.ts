import { extractSwitchTitleId } from '@/lib/scanner/titleid'

/**
 * Title IDs de la biblioteca como los usa la tienda: el del nombre de fichero y, si no lo
 * trae, el guardado a mano. Así un torrent casa con un juego de la biblioteca por el mismo ID.
 */
export function libraryTitleIds(games: { fileName: string; titleId: string | null }[]): Set<string> {
  const ids = new Set<string>()
  for (const g of games) {
    const id = extractSwitchTitleId(g.fileName) ?? g.titleId?.toUpperCase()
    if (id) ids.add(id)
  }
  return ids
}
