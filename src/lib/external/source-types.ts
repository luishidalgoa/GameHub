export const SOURCE_TYPES = {
  'json-list': { label: 'Lista JSON', host: 'raw.githubusercontent.com' },
  'minerva-directory': { label: 'Directorio de Minerva Archive', host: 'minerva-archive.org' },
} as const

export type SourceType = keyof typeof SOURCE_TYPES

export interface SourceConfig {
  key: string
  type: SourceType
  url: string
  enabled: boolean
  /** Solo las entradas cuyo título lleve esta etiqueta entre corchetes, p. ej. "NUP" para Switch 2. */
  onlyTag?: string
  /** Las entradas con esta etiqueta entre corchetes se dejan fuera (la otra mitad de un reparto). */
  exceptTag?: string
}

const KEY = /^[a-z0-9][a-z0-9-]{0,62}$/
const TAG = /^[A-Za-z0-9]{1,16}$/

/** Motivo por el que una fuente no es válida, o null si lo es. */
export function sourceConfigError(c: Partial<SourceConfig>): string | null {
  if (!c.key || !KEY.test(c.key)) return 'clave no válida (minúsculas, cifras y guiones)'
  if (!c.type || !Object.keys(SOURCE_TYPES).includes(c.type)) return 'tipo de fuente desconocido'
  let url: URL
  try {
    url = new URL(c.url ?? '')
  } catch {
    return 'URL no válida'
  }
  const { host } = SOURCE_TYPES[c.type]
  if (url.protocol !== 'https:') return 'la URL tiene que ser https'
  if (url.hostname !== host) return `la URL tiene que ser de ${host}`
  if (typeof c.enabled !== 'boolean') return 'enabled tiene que ser verdadero o falso'
  if (c.onlyTag !== undefined && !TAG.test(c.onlyTag)) return 'onlyTag tiene que ser una etiqueta de letras y cifras'
  if (c.exceptTag !== undefined && !TAG.test(c.exceptTag)) return 'exceptTag tiene que ser una etiqueta de letras y cifras'
  if (c.onlyTag !== undefined && c.exceptTag !== undefined) return 'onlyTag y exceptTag no pueden ir juntas'
  return null
}

/**
 * Reparte una fuente entre plataformas por la etiqueta del título («[NUP]»): con `onlyTag` se queda
 * solo lo que la lleva; con `exceptTag` se quita. Sin etiqueta, la fuente entera.
 */
export function filterByTag<T extends { title?: string }>(
  entries: T[],
  source: Pick<SourceConfig, 'onlyTag' | 'exceptTag'>,
): T[] {
  const tag = source.onlyTag ?? source.exceptTag
  if (!tag) return entries
  const marker = `[${tag}]`.toLowerCase()
  const has = (e: T) => (e.title ?? '').toLowerCase().includes(marker)
  return source.onlyTag ? entries.filter(has) : entries.filter(e => !has(e))
}

export function parseSourceConfigs(raw: string | null | undefined): SourceConfig[] {
  if (!raw) return []
  try {
    const list: unknown = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.filter((c): c is SourceConfig => sourceConfigError(c as Partial<SourceConfig>) === null)
  } catch {
    return []
  }
}
