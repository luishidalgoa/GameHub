import type { RawEntry, ExternalSourceProvider } from './types'

const TIMEOUT_MS = 180_000

/**
 * Fuente JSON: descarga una URL que devuelve JSON y lo convierte en entradas con la función
 * de parseo que se le pase. Uso actual: switch-games.
 */
export class JsonSourceProvider implements ExternalSourceProvider {
  constructor(
    private readonly url: string,
    private readonly parse: (raw: unknown) => RawEntry[],
  ) {}

  async fetchEntries(): Promise<RawEntry[]> {
    const res = await fetch(this.url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${this.url}`)
    return this.parse(await res.json())
  }
}
