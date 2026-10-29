import { describe, it, expect } from 'vitest'
import { DownloadMeter, type MeterFlush } from '@/lib/download-meter'

function meter(flushEveryMs = 2000) {
  const flushes: MeterFlush[] = []
  const m = new DownloadMeter(0, flushEveryMs, f => flushes.push(f))
  return { m, flushes }
}

describe('DownloadMeter', () => {
  it('no entrega nada antes del intervalo', () => {
    const { m, flushes } = meter()
    m.add(1000, 500)
    m.add(1000, 1500)
    expect(flushes).toEqual([])
  })

  it('entrega los bytes acumulados y la velocidad media del tramo', () => {
    const { m, flushes } = meter()
    m.add(2_000_000, 1000)
    m.add(2_000_000, 2000)
    expect(flushes).toHaveLength(1)
    expect(flushes[0]).toEqual({ bytes: 4_000_000, at: 2000, bytesPerSecond: 2_000_000 })
  })

  it('al terminar entrega lo que quedó pendiente', () => {
    const { m, flushes } = meter()
    m.add(300, 100)
    m.end(400)
    expect(flushes).toEqual([{ bytes: 300, at: 400, bytesPerSecond: 750 }])
  })

  it('no entrega un tramo vacío al terminar', () => {
    const { m, flushes } = meter()
    m.end(400)
    expect(flushes).toEqual([])
  })

  it('no divide entre cero con un tramo de menos de un milisegundo', () => {
    const { m, flushes } = meter(0)
    m.add(10, 0)
    expect(flushes[0].bytesPerSecond).toBe(10_000)
  })
})
