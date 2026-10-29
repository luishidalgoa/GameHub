/**
 * Medidor de progreso de una descarga: cuenta los bytes que salen hacia el cliente y
 * los entrega en tramos (cada `flushEveryMs`), con la velocidad de ese tramo.
 *
 * No toca la base de datos ni el reloj: el llamador pasa la hora, así que se prueba
 * sin esperas.
 */

export interface MeterFlush {
  /** Bytes enviados desde el tramo anterior. */
  bytes: number
  /** Hora del tramo, en ms. */
  at: number
  /** Velocidad media del tramo, en bytes por segundo. */
  bytesPerSecond: number
}

/** Tope que cabe en la columna speedBps (Int de 32 bits). Un tramo más rápido se guarda con este valor. */
export const MAX_BYTES_PER_SECOND = 2_000_000_000

export class DownloadMeter {
  private pending = 0
  private lastFlushAt: number

  constructor(
    startedAt: number,
    private readonly flushEveryMs: number,
    private readonly onFlush: (flush: MeterFlush) => void,
  ) {
    this.lastFlushAt = startedAt
  }

  /** Suma bytes enviados en el instante `now` y entrega el tramo si ya toca. */
  add(bytes: number, now: number): void {
    if (bytes <= 0) return
    this.pending += bytes
    if (now - this.lastFlushAt >= this.flushEveryMs) this.flush(now)
  }

  /** Entrega lo que quede pendiente, al terminar o al cortarse la conexión. */
  end(now: number): void {
    if (this.pending > 0) this.flush(now)
  }

  private flush(now: number): void {
    // Un tramo de menos de un milisegundo se cuenta como uno: evita dividir entre cero.
    const seconds = Math.max(1, now - this.lastFlushAt) / 1000
    const bytesPerSecond = Math.min(MAX_BYTES_PER_SECOND, Math.round(this.pending / seconds))
    this.onFlush({ bytes: this.pending, at: now, bytesPerSecond })
    this.pending = 0
    this.lastFlushAt = now
  }
}
