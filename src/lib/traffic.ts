import { db } from './db'
import { detectDevice, detectBrowser, detectClient, getClientIp } from './tracker'
import { DownloadMeter, type MeterFlush } from './download-meter'

export async function logDownloadStart(opts: {
  req: Request
  gameId: number
  dlcId?: number
  dlcType?: string
  fileName: string
  fileSize: bigint
}): Promise<number> {
  const ip = getClientIp(opts.req)
  const h = opts.req.headers as unknown as { get: (k: string) => string | null }
  const ua = h.get('user-agent') ?? ''
  // Our own client identifies itself; everything else is sniffed from the UA.
  const { client, version } = detectClient(ua, h.get('x-gamehub-client'))
  const log = await db.downloadLog.create({
    data: {
      gameId: opts.gameId,
      dlcId: opts.dlcId,
      dlcType: opts.dlcType,
      ip,
      device: detectDevice(ua),
      browser: detectBrowser(ua),
      client,
      clientVersion: version,
      fileName: opts.fileName,
      fileSize: opts.fileSize,
    },
  })
  return log.id
}

export async function logDownloadComplete(logId: number) {
  await db.downloadLog.update({
    where: { id: logId },
    data: { finishedAt: new Date(), completed: true },
  })
}

/** Cada cuánto se guarda el progreso de una descarga. */
export const PROGRESS_FLUSH_MS = 2000

/** Los bytes se cuentan en piezas de este tamaño, al salir de cada una, no por bloque de 4 MiB. */
const PIECE_BYTES = 64 * 1024

/** Un intento sigue abierto mientras reciba bytes, aunque su primera petición sea de hace horas. */
const ATTEMPT_ACTIVE_MS = 24 * 60 * 60 * 1000

/**
 * El intento al que cuentan los bytes de una petición: el más reciente del mismo cliente, juego y
 * archivo que todavía no tiene todos sus bytes y ha recibido algo en las últimas 24 h. Un intento
 * acabado no vuelve a contar aunque llegue otra petición del mismo archivo.
 *
 * El cliente se identifica por IP. Detrás de un proxy sin TRUST_PROXY todos comparten IP, y dos
 * consolas en la misma red pueden mezclarse: es una limitación de las cifras, no de la descarga.
 */
export async function findOpenAttempt(opts: {
  ip: string
  gameId: number
  dlcId?: number
  fileName: string
  now?: Date
}): Promise<number | null> {
  const since = new Date((opts.now ?? new Date()).getTime() - ATTEMPT_ACTIVE_MS)
  const rows = await db.downloadLog.findMany({
    where: {
      ip: opts.ip,
      gameId: opts.gameId,
      dlcId: opts.dlcId ?? null,
      fileName: opts.fileName,
      OR: [{ lastByteAt: { gte: since } }, { lastByteAt: null, startedAt: { gte: since } }],
    },
    orderBy: { startedAt: 'desc' },
    take: 5,
    select: { id: true, bytesSent: true, fileSize: true },
  })
  return rows.find(r => r.bytesSent < r.fileSize)?.id ?? null
}

/** Guarda un tramo de progreso en el intento: bytes sumados, último byte y velocidad. */
export async function recordProgress(logId: number, flush: MeterFlush): Promise<void> {
  await db.downloadLog.update({
    where: { id: logId },
    data: {
      bytesSent: { increment: BigInt(flush.bytes) },
      lastByteAt: new Date(flush.at),
      speedBps: flush.bytesPerSecond,
    },
  })
}

/**
 * Cuenta los bytes que salen hacia el cliente y los guarda en el intento. Cada pieza se cuenta
 * al salir de la respuesta, así que el progreso sigue a un cliente lento. Las escrituras van en
 * serie: si una falla, sus bytes se suman al tramo siguiente. Al cortarse la conexión se guarda
 * lo que quedaba pendiente.
 *
 * Son bytes en el cable: una pieza que el cliente pide otra vez se cuenta dos veces.
 */
export function trackDownloadBody(body: ReadableStream<Uint8Array>, logId: number): ReadableStream<Uint8Array> {
  let unsaved = 0
  let queue: Promise<void> = Promise.resolve()
  const save = (flush: MeterFlush) => {
    queue = queue.then(async () => {
      const bytes = unsaved + flush.bytes
      try {
        await recordProgress(logId, { ...flush, bytes })
        unsaved = 0
      } catch {
        unsaved = bytes
      }
    })
  }

  const meter = new DownloadMeter(Date.now(), PROGRESS_FLUSH_MS, save)
  const reader = body.getReader()
  let pending: Uint8Array | null = null

  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        if (pending === null) {
          const { done, value } = await reader.read()
          if (done || !value) {
            meter.end(Date.now())
            controller.close()
            return
          }
          pending = value
        }
        const take = Math.min(PIECE_BYTES, pending.byteLength)
        const piece = pending.subarray(0, take)
        pending = take < pending.byteLength ? pending.subarray(take) : null
        controller.enqueue(piece)
        meter.add(piece.byteLength, Date.now())
      },
      cancel(reason) {
        meter.end(Date.now())
        return reader.cancel(reason)
      },
    },
    { highWaterMark: 0 },
  )
}
