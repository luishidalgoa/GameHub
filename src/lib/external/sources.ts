/**
 * Fuentes de torrents. Cada una pertenece a una plataforma y convierte su formato en entradas
 * con esta forma. Una plataforma sin fuentes no tiene torrents; añadir una fuente nueva es
 * añadir una entrada aquí. La clave de la fuente no puede contener «:».
 */

/** Una entrada de una fuente, ya en el formato común. */
export interface RawEntry {
  title?: string
  magnet?: string
  topic_id?: string
  url?: string
  size?: string
  title_id?: string
  image_format?: string
  year?: string
  genre?: string
  developer?: string
  publisher?: string
  cover?: string
  description?: string
}

export interface TorrentSource {
  key: string
  platformSlug: string
  label: string
  url: string
  /** Convierte la respuesta de la fuente en entradas; lanza si el formato no es el esperado. */
  parse: (raw: unknown) => RawEntry[]
}

export const TORRENT_SOURCES: TorrentSource[] = [
  {
    key: 'switch-games',
    platformSlug: 'switch',
    label: 'Langegen/switch-games (RuTracker)',
    url: 'https://raw.githubusercontent.com/Langegen/switch-games/main/switch_games.json',
    parse: raw => {
      if (!Array.isArray(raw)) throw new Error('la fuente no es una lista')
      return raw as RawEntry[]
    },
  },
]

/** Las fuentes de una plataforma, o de todas cuando no se indica ninguna. */
export function torrentSourcesFor(platformSlug?: string): TorrentSource[] {
  return platformSlug ? TORRENT_SOURCES.filter(s => s.platformSlug === platformSlug) : TORRENT_SOURCES
}

/** Orden de preferencia entre fuentes de un mismo juego: la primera del registro gana. */
export function sourcePriority(key: string): number {
  const i = TORRENT_SOURCES.findIndex(s => s.key === key)
  return i < 0 ? Number.MAX_SAFE_INTEGER : i
}
