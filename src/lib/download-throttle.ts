/**
 * Límite de velocidad de las descargas de juegos y DLC.
 *
 * El tope vive en la tabla Setting, con la clave `download_limit_kib_per_s` en
 * KiB/s. Vacío, 0 o no numérico significa sin límite. Las descargas de
 * GameHubNX no se limitan: la app manda `User-Agent: GameHubNX/<versión>` y eso
 * la identifica. Es identificación para repartir ancho de banda, no seguridad:
 * cualquier cliente puede mandar ese User-Agent.
 *
 * Este módulo no toca la base de datos, para poder probarlo sin Prisma.
 */

export const DOWNLOAD_LIMIT_SETTING = 'download_limit_kib_per_s'

const EXEMPT_USER_AGENT_PREFIX = 'GameHubNX/'

// Trozos de este tamaño: el tope se cumple por tramos cortos, no por bloques
// de 4 MiB que tardarian segundos en salir de golpe.
const PIECE_BYTES = 64 * 1024

export function isExemptFromDownloadLimit(userAgent: string | null | undefined): boolean {
  return typeof userAgent === 'string' && userAgent.startsWith(EXEMPT_USER_AGENT_PREFIX)
}

/** KiB/s del ajuste. 0 = sin límite. Lo que no sea un número positivo cuenta como 0. */
export function parseDownloadLimitKib(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw.trim() === '') return 0
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.floor(n)
}

export interface PacingClock {
  now(): number
  sleep(ms: number): Promise<void>
}

const realClock: PacingClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

/**
 * Envuelve un ReadableStream para que la media no pase de `bytesPerSecond`.
 * Cada trozo se entrega cuando el reloj ya ha dejado pasar sus bytes, así que
 * una descarga lenta de cliente no acumula nada en memoria: el stream de origen
 * solo se lee cuando hay hueco.
 */
export function throttleWebStream(
  source: ReadableStream<Uint8Array>,
  bytesPerSecond: number,
  clock: PacingClock = realClock,
): ReadableStream<Uint8Array> {
  const reader = source.getReader()
  const startedAt = clock.now()
  let sent = 0
  let pending: Uint8Array | null = null

  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        if (pending === null) {
          const { done, value } = await reader.read()
          if (done || !value) {
            controller.close()
            return
          }
          pending = value
        }
        const take = Math.min(PIECE_BYTES, pending.byteLength)
        const piece = pending.subarray(0, take)
        pending = take < pending.byteLength ? pending.subarray(take) : null

        sent += piece.byteLength
        const dueAt = startedAt + (sent / bytesPerSecond) * 1000
        const wait = dueAt - clock.now()
        // Menos de un milisegundo no merece un temporizador.
        if (wait >= 1) await clock.sleep(wait)
        controller.enqueue(piece)
      },
      async cancel(reason) {
        await reader.cancel(reason)
      },
    },
    { highWaterMark: 0 },
  )
}
