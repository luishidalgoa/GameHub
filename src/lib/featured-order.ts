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
