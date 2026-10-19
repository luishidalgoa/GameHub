/**
 * Aplica el límite de velocidad de descarga a una respuesta de juego o DLC.
 * El ajuste se lee de la tabla Setting y se cachea 30 s para no consultar la base
 * de datos en cada petición de rango. Si la lectura falla, la descarga va sin
 * límite: un fallo de la base de datos no debe cortar las descargas.
 */
import { db } from '@/lib/db'
import {
  DOWNLOAD_LIMIT_SETTING,
  isExemptFromDownloadLimit,
  parseDownloadLimitKib,
  throttleWebStream,
} from '@/lib/download-throttle'

const CACHE_MS = 30_000

let cached: { bytesPerSecond: number; at: number } | null = null

/** Bytes por segundo del tope vigente. 0 = sin límite. */
export async function currentDownloadLimitBytesPerSecond(now: number = Date.now()): Promise<number> {
  if (cached && now - cached.at < CACHE_MS) return cached.bytesPerSecond
  let bytesPerSecond = 0
  try {
    const row = await db.setting.findUnique({ where: { key: DOWNLOAD_LIMIT_SETTING } })
    bytesPerSecond = parseDownloadLimitKib(row?.value) * 1024
  } catch {
    bytesPerSecond = 0
  }
  cached = { bytesPerSecond, at: now }
  return bytesPerSecond
}

/** Para que un cambio en el admin se note sin esperar los 30 s (y en pruebas). */
export function invalidateDownloadLimitCache(): void {
  cached = null
}

/**
 * Devuelve el cuerpo a enviar: el mismo stream si no hay límite o si el cliente
 * es GameHubNX, o el stream con el tope aplicado en otro caso.
 */
export async function paceDownloadBody(
  req: Request,
  body: ReadableStream<Uint8Array>,
): Promise<ReadableStream<Uint8Array>> {
  if (isExemptFromDownloadLimit(req.headers.get('user-agent'))) return body
  const bytesPerSecond = await currentDownloadLimitBytesPerSecond()
  if (bytesPerSecond <= 0) return body
  return throttleWebStream(body, bytesPerSecond)
}
