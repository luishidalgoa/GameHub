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
  return resolveRoots(parent, rows.length)
}

/** Sube cada fila por su cadena de padres hasta la raíz. Las filas sin padre no entran en el mapa. */
function resolveRoots(parent: Map<number, number>, size: number): Map<number, number> {
  const plan = new Map<number, number>()
  for (const id of parent.keys()) {
    let root = id
    for (let hops = 0; parent.has(root) && hops < size; hops++) root = parent.get(root)!
    if (root !== id) plan.set(id, root)
  }
  return plan
}

export interface FoldGame extends FoldRow {
  source: string
  isHidden: boolean
  launchboxId: number | null
  hasCover: boolean
}

/**
 * Plegado completo, en tres pasos:
 *  1. Por nombre (planVariantFold): «Juego - Extra» va bajo «Juego».
 *  2. Por ID de LaunchBox: las filas torrent con el mismo ID que una raíz visible van bajo ella.
 *  3. Por nombre exacto, para las filas sin ID de LaunchBox: las que se llaman igual van bajo una raíz.
 * En cada grupo la raíz es la local si la hay, luego la que tiene portada, y por último la de id menor.
 */
export function planFold(games: FoldGame[]): Map<number, number> {
  const named = planVariantFold(games)
  const parent = new Map(named)
  const byLaunchBox = new Map<number, FoldGame[]>()
  const byName = new Map<string, FoldGame[]>()
  for (const g of games) {
    if (named.has(g.id)) continue
    if (g.launchboxId !== null) {
      byLaunchBox.set(g.launchboxId, [...(byLaunchBox.get(g.launchboxId) ?? []), g])
    } else {
      const key = titleKey(decodeTitle(g.rawTitle))
      if (key) byName.set(key, [...(byName.get(key) ?? []), g])
    }
  }
  for (const members of [...byLaunchBox.values(), ...byName.values()]) groupUnder(members, parent)
  return resolveRoots(parent, games.length)
}

/** Pone cada torrent del grupo bajo su raíz: la visible mejor clasificada. Un grupo sin visibles no se toca. */
function groupUnder(members: FoldGame[], parent: Map<number, number>) {
  const visible = members.filter(m => !m.isHidden)
  if (visible.length === 0) return
  const rank = (g: FoldGame) => (g.source === 'local' ? 0 : 2) + (g.hasCover ? 0 : 1)
  const root = [...visible].sort((a, b) => rank(a) - rank(b) || a.id - b.id)[0]
  for (const m of members) {
    if (m.id !== root.id && m.source === 'torrent') parent.set(m.id, root.id)
  }
}
