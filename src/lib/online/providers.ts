import { parseNextendoTitles } from './nextendo'

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
  sourceUrl: string
  parse: (text: string) => OnlineEntry[]
}

export const ONLINE_SOURCES: OnlineSource[] = [
  {
    key: 'nextendo',
    label: 'Nextendo Network',
    url: 'https://github.com/NextendoNetwork',
    sourceUrl: 'https://raw.githubusercontent.com/NextendoNetwork/citron-nextendo/HEAD/src/common/nextendo_compatible_titles.h',
    parse: parseNextendoTitles,
  },
]

/** La lista JSON de proyectos de una plataforma; vacía o mal formada no enlaza nada. */
export function parseOnlineProviders(raw: string | null | undefined): OnlineProviderLink[] {
  if (!raw) return []
  try {
    const list: unknown = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.flatMap((p): OnlineProviderLink[] => {
      const e = p as Partial<OnlineProviderLink>
      return typeof e?.key === 'string' && typeof e.label === 'string' && typeof e.url === 'string'
        ? [{ key: e.key, label: e.label, url: e.url }]
        : []
    })
  } catch {
    return []
  }
}
