/** Entrada en el formato común que cualquier fuente externa produce. */
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

/** Contrato que toda fuente externa implementa: obtiene sus entradas y las devuelve. */
export interface ExternalSourceProvider {
  fetchEntries(): Promise<RawEntry[]>
}
