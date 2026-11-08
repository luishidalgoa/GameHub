import type { RawEntry, ExternalSourceProvider } from './types'
import { parseNoIntroFilename } from '../no-intro'

const TIMEOUT_MS = 180_000

/**
 * Fuente HTML: scrapa un directorio de Minerva Archive y devuelve una entrada por juego.
 * La página lista archivos con su nombre No-Intro/Redump, tamaño y magnet individual.
 * Sin paginación: toda la carpeta carga en una sola petición.
 */
export class MinervaDirectoryProvider implements ExternalSourceProvider {
  constructor(private readonly directoryUrl: string) {}

  async fetchEntries(): Promise<RawEntry[]> {
    const res = await fetch(this.directoryUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${this.directoryUrl}`)
    return parseMinervaHtml(await res.text())
  }
}

function parseMinervaHtml(html: string): RawEntry[] {
  // Los trackers están en un bloque <script> como: const trackers = "&tr=...";
  const trackersMatch = html.match(/const trackers = "([^"]+)"/)
  const trackers = trackersMatch ? trackersMatch[1] : ''

  const entries: RawEntry[] = []
  // Cada juego es un <div class="entry"> con un enlace /rom?id=ID
  const parts = html.split('<div class="entry"')
  for (const part of parts.slice(1)) {
    // Solo filas de fichero (tienen /rom?id=); las carpetas tienen <strong>
    const romMatch = part.match(/href="\/rom\?id=(\d+)"[^>]*>([^<]+)<\/a>/)
    if (!romMatch) continue
    const [, romId, filename] = romMatch
    // Omitir BIOS, actualizaciones y DLC sueltos del sistema
    if (/^\[(BIOS|System)\]/i.test(filename)) continue
    const magnetMatch = part.match(/downloadMagnet\('([^']+)'\)/)
    if (!magnetMatch) continue
    const baseMagnet = magnetMatch[1].replace(/&amp;/g, '&')
    const sizeMatch = part.match(/<span>([^<]+)<\/span>/)
    const { title } = parseNoIntroFilename(filename)
    if (!title) continue
    entries.push({
      title,
      magnet: baseMagnet + trackers,
      file_name: filename,
      topic_id: romId,
      url: `https://minerva-archive.org/rom?id=${romId}`,
      size: sizeMatch ? sizeMatch[1].trim() : undefined,
    })
  }
  return entries
}
