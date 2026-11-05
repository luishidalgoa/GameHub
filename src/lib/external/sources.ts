/**
 * Proveedores de fuentes de torrents. Qué fuente usa cada plataforma y con qué URL lo decide
 * admin (Platform.torrentSources); aquí solo está cómo descarga cada tipo.
 */
import { JsonSourceProvider } from './providers/json-provider'
import { MinervaDirectoryProvider } from './providers/minerva-provider'
import type { ExternalSourceProvider, RawEntry } from './providers/types'
import type { SourceConfig, SourceType } from './source-types'

export type { RawEntry } from './providers/types'
export type { ExternalSourceProvider }

const FACTORIES: Record<SourceType, (url: string) => ExternalSourceProvider> = {
  'json-list': url => new JsonSourceProvider(url, raw => {
    if (!Array.isArray(raw)) throw new Error('la fuente no es una lista')
    return raw as RawEntry[]
  }),
  'minerva-directory': url => new MinervaDirectoryProvider(url),
}

export function createProvider(source: SourceConfig): ExternalSourceProvider {
  return FACTORIES[source.type](source.url)
}
