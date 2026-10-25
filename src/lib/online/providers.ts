import { parseNextendoTitles } from './nextendo'
import { fetchText } from './fetch'
import { loadPretendoTitles } from './pretendo'

/** Un proyecto de juego en línea que una plataforma enlaza en su página. */
export interface OnlineProviderLink {
  key: string
  label: string
  url: string
}

/** Un juego de la fuente de un proveedor, por Title ID. */
export interface OnlineEntry {
  titleId: string
  status: 'compatible'
  requiredVersion: string | null
  name: string | null
}

/**
 * De dónde sale la compatibilidad de un proveedor. Para añadir otro (Pretendo en 3DS)
 * basta con otra entrada aquí y su parser; la plataforma lo activa con `onlineProviders`.
 */
export interface OnlineSource extends OnlineProviderLink {
  /** Slugs de las plataformas donde se ofrece este proveedor. */
  platforms: string[]
  /** Lee la lista de títulos de la fuente (red). */
  load: () => Promise<OnlineEntry[]>
}

export const ONLINE_SOURCES: OnlineSource[] = [
  {
    key: 'nextendo',
    label: 'Nextendo Network',
    url: 'https://github.com/NextendoNetwork',
    platforms: ['switch'],
    load: () => fetchText('https://raw.githubusercontent.com/NextendoNetwork/citron-nextendo/HEAD/src/common/nextendo_compatible_titles.h')
      .then(parseNextendoTitles),
  },
  {
    // Pretendo no publica una lista de compatibilidad: su herramienta nex-viewer tiene un
    // fichero por juego 3DS con sus Title IDs. Un juego en esa lista es un juego que
    // Pretendo tiene modelado, no una garantía de que funcione entero.
    key: 'pretendo',
    label: 'Pretendo Network',
    url: 'https://github.com/PretendoNetwork',
    platforms: ['3ds'],
    load: loadPretendoTitles,
  },
]

/**
 * Forma comparable de un título, para casar el nombre de la fuente con el de la biblioteca:
 * sin acentos, sin lo que va entre paréntesis ("(EU)"), sin la coletilla de Nintendo Switch
 * Online y sin puntuación. Así "Splatoon 2 (EU)" casa con "Splatoon 2".
 */
export function normalizeGameTitle(title: string): string {
  return title
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s*-\s*(nintendo switch online|nintendo classics)\s*$/i, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Configuración de un proveedor en una plataforma: si está activo y a qué proyecto enlaza. */
export interface OnlineProviderConfig extends OnlineProviderLink {
  enabled: boolean
}

/** Todas las entradas válidas de la plataforma, activas o no; mal formada, ninguna. */
export function parseOnlineConfigs(raw: string | null | undefined): OnlineProviderConfig[] {
  if (!raw) return []
  try {
    const list: unknown = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.flatMap((p): OnlineProviderConfig[] => {
      const e = p as Partial<OnlineProviderConfig>
      return typeof e?.key === 'string' && typeof e.label === 'string' && typeof e.url === 'string'
        ? [{ key: e.key, label: e.label, url: e.url, enabled: e.enabled !== false }]
        : []
    })
  } catch {
    return []
  }
}

/** Los proyectos activos de una plataforma: los que enlaza y cuyo catálogo cuenta para el badge. */
export function parseOnlineProviders(raw: string | null | undefined): OnlineProviderLink[] {
  return parseOnlineConfigs(raw)
    .filter(c => c.enabled)
    .map(({ key, label, url }) => ({ key, label, url }))
}

export function serializeOnlineConfigs(configs: OnlineProviderConfig[]): string | null {
  return configs.length ? JSON.stringify(configs) : null
}
