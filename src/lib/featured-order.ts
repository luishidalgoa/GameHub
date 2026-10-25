/**
 * Orden manual de los destacados de portada. Un número (1 = primero) fija el
 * puesto del juego; sin número, entra detrás de los fijados, ordenado por nota.
 */
export const FEATURED_ORDER_MAX = 99

/** Número entero de 1 a 99, o null cuando el campo está vacío o no sirve. */
export function parseFeaturedOrder(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n < 1 || n > FEATURED_ORDER_MAX) return null
  return n
}

interface Featured {
  featuredOrder: number | null
  rawgScore: number | null
}

/** Los fijados primero, por su número; el resto, por nota de mayor a menor. */
export function orderFeatured<T extends Featured>(rows: readonly T[]): T[] {
  return rows.slice().sort((a, b) => {
    const byScore = (b.rawgScore ?? 0) - (a.rawgScore ?? 0)
    if (a.featuredOrder === null && b.featuredOrder === null) return byScore
    if (a.featuredOrder === null) return 1
    if (b.featuredOrder === null) return -1
    return a.featuredOrder - b.featuredOrder || byScore
  })
}

interface Scored {
  id: number
  rawgScore: number | null
}

/**
 * Reparto de la portada. El carrusel toma primero los destacados, en su orden, y
 * completa con los más populares. La rejilla muestra los destacados que sobran y
 * completa con los mejor valorados. Ningún juego sale dos veces.
 */
export function chooseHome<T extends Featured & Scored, P extends Scored>(
  picks: readonly T[],
  popular: readonly P[],
  sizes: { hero: number; wall: number },
): { hero: (T | P)[]; wall: (T | P)[] } {
  const ordered = orderFeatured(picks)
  const pickIds = new Set(ordered.map(g => g.id))
  const hero: (T | P)[] = [
    ...ordered.slice(0, sizes.hero),
    ...popular.filter(g => !pickIds.has(g.id)),
  ].slice(0, sizes.hero)

  const taken = new Set(hero.map(g => g.id))
  const wall: (T | P)[] = ordered.filter(g => !taken.has(g.id)).slice(0, sizes.wall)
  wall.forEach(g => taken.add(g.id))
  const filler = popular
    .filter(g => !taken.has(g.id))
    .sort((a, b) => (b.rawgScore ?? 0) - (a.rawgScore ?? 0))
    .slice(0, sizes.wall - wall.length)
  return { hero, wall: [...wall, ...filler] }
}

export interface SlotPick {
  id: number
  title: string
  featuredOrder: number | null
}

/**
 * Qué juego ocupa el puesto `order` para `gameId` y a qué puesto pasará el
 * ocupante al guardar: el que tiene hoy el juego (`currentOrder`), o automático.
 */
export function describeSlot(picks: readonly SlotPick[], gameId: number, order: number | null, currentOrder: number | null) {
  if (order === null) return { occupant: null, swapTo: null }
  const occupant = picks.find(p => p.featuredOrder === order && p.id !== gameId) ?? null
  return { occupant, swapTo: occupant ? currentOrder : null }
}
