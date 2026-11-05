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
}

const KEY = /^[a-z0-9][a-z0-9-]{0,62}$/

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
  return null
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
