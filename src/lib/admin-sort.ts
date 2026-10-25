export type SortDir = 'asc' | 'desc'
export interface SortState<K extends string> {
  key: K
  dir: SortDir
}

/** Orden pedido en la URL (`sort`, `dir`). Sin un `sort` válido manda el orden por defecto, con su dirección. */
export function parseSort<K extends string>(sp: Record<string, string | undefined>, keys: readonly K[], def: SortState<K>): SortState<K> {
  const key = sp.sort as K
  if (!keys.includes(key)) return def
  const dir: SortDir = sp.dir === 'desc' ? 'desc' : sp.dir === 'asc' ? 'asc' : key === def.key ? def.dir : 'asc'
  return { key, dir }
}

/** Pulsar la cabecera activa invierte el orden; pulsar otra la ordena ascendente. */
export function nextSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  return current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
}

/** Parámetros de URL para un orden; el orden por defecto no ensucia la URL. */
export function sortParams<K extends string>(state: SortState<K>, def: SortState<K>): Record<string, string> {
  return state.key === def.key && state.dir === def.dir ? {} : { sort: state.key, dir: state.dir }
}

/** Ordena sin mutar; los valores vacíos (null/undefined) van siempre al final. */
export function sortRows<T, K extends string>(rows: T[], state: SortState<K>, value: (row: T, key: K) => string | number | null | undefined): T[] {
  const sign = state.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = value(a, state.key)
    const y = value(b, state.key)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign
    return String(x).localeCompare(String(y), 'es', { numeric: true, sensitivity: 'base' }) * sign
  })
}
