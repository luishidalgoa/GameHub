import { extractSwitchTitleId } from '@/lib/scanner/titleid'
import { normalizeGameTitle } from '@/lib/online/providers'

/** Clave de nombre de un juego: sin formato [NSP], sin «+ N DLC» y en la forma comparable del catálogo. */
export function titleKey(title: string): string {
  const base = title
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\+\s*\d+\s*DLC.*$/i, ' ')
  return normalizeGameTitle(base)
}

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

/** Claves de nombre de la biblioteca. Las demasiado cortas no sirven para casar. */
export function libraryTitleKeys(games: { title: string }[]): Set<string> {
  const keys = new Set<string>()
  for (const g of games) {
    const k = titleKey(g.title)
    if (k.length >= 4) keys.add(k)
  }
  return keys
}
