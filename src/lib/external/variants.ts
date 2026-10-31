import { titleKey } from './match'

/**
 * Las variantes de un juego en un catálogo torrent (edición, camiseta, traje, extra) traen el
 * nombre del juego base seguido de « - » y el subtítulo: «Akiba's Beat - Butler Mizuki».
 * Cada una es una fila propia; aquí se decide cuál es la base de cada una.
 */
const SEPARATOR = ' - '

/** Entidades HTML que el catálogo deja en los títulos («Akiba&#39;s»). */
function decodeTitle(title: string): string {
  return title.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

export interface FoldRow {
  id: number
  /** Título tal como lo trae el catálogo (con entidades HTML). */
  rawTitle: string
}

/**
 * Para cada variante, el id de la fila base. Base es una fila cuyo título no lleva « - » y casa
 * con el prefijo de la variante. Se prueba el prefijo más largo: «Senran Kagura - Shinovi Versus -
 * Asuka» se pliega en «Senran Kagura - Shinovi Versus» antes que en «Senran Kagura». Si no hay base,
 * la fila no aparece en el mapa y se queda como juego propio. Con dos bases del mismo nombre gana la de id menor.
 */
export function planVariantFold(rows: FoldRow[]): Map<number, number> {
  const bases = new Map<string, number>()
  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    const title = decodeTitle(row.rawTitle)
    if (title.includes(SEPARATOR)) continue
    const key = titleKey(title)
    if (key && !bases.has(key)) bases.set(key, row.id)
  }
  const plan = new Map<number, number>()
  for (const row of rows) {
    const parts = decodeTitle(row.rawTitle).split(SEPARATOR)
    for (let n = parts.length - 1; n >= 1; n--) {
      const base = bases.get(titleKey(parts.slice(0, n).join(SEPARATOR)))
      if (base !== undefined && base !== row.id) {
        plan.set(row.id, base)
        break
      }
    }
  }
  return plan
}
