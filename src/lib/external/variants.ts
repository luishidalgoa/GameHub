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
 * Para cada variante, el id de su juego base: la fila cuyo título es el prefijo más largo del suyo.
 * «Senran Kagura - Shinovi Versus - Asuka» se pliega en «Senran Kagura - Shinovi Versus» antes que
 * en «Senran Kagura». Un título puede llevar « - » y ser base («Akiba's Trip - Undead & Undressed»),
 * así que el nombre con guion no lo excluye. Si una base es a su vez variante, la cadena sube hasta
 * la raíz: el mapa apunta siempre a una fila que se queda visible. Sin base, la fila no sale en el mapa.
 * Con dos filas del mismo nombre gana la de id menor.
 */
export function planVariantFold(rows: FoldRow[]): Map<number, number> {
  const bases = new Map<string, number>()
  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    const key = titleKey(decodeTitle(row.rawTitle))
    if (key && !bases.has(key)) bases.set(key, row.id)
  }
  const parent = new Map<number, number>()
  for (const row of rows) {
    const parts = decodeTitle(row.rawTitle).split(SEPARATOR)
    for (let n = parts.length - 1; n >= 1; n--) {
      const base = bases.get(titleKey(parts.slice(0, n).join(SEPARATOR)))
      if (base !== undefined && base !== row.id) {
        parent.set(row.id, base)
        break
      }
    }
  }
  const plan = new Map<number, number>()
  for (const row of rows) {
    let root = row.id
    for (let hops = 0; parent.has(root) && hops < rows.length; hops++) root = parent.get(root)!
    if (root !== row.id) plan.set(row.id, root)
  }
  return plan
}
