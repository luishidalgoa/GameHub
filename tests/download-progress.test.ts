import { describe, it, expect } from 'vitest'
import { downloadProgress } from '@/lib/traffic-stats'

const base = { fileSize: 1_000_000, startedAt: 0, now: 10_000 }

describe('downloadProgress', () => {
  it('calcula el progreso y el tiempo restante a la velocidad de ahora', () => {
    const p = downloadProgress({ ...base, bytesSent: 250_000, speedBps: 100_000, lastByteAt: 9_000 })
    expect(p.progress).toBeCloseTo(0.25)
    expect(p.bytesPerSecond).toBe(100_000)
    expect(p.etaSeconds).toBe(8)
    expect(p.complete).toBe(false)
  })

  it('una descarga parada más de 10 s tiene velocidad 0 y sin tiempo restante', () => {
    const p = downloadProgress({ ...base, bytesSent: 250_000, speedBps: 100_000, lastByteAt: -1_000 })
    expect(p.bytesPerSecond).toBe(0)
    expect(p.etaSeconds).toBeNull()
  })

  it('la velocidad media sale del tiempo entre el primer y el último byte', () => {
    const p = downloadProgress({ ...base, bytesSent: 1_000_000, speedBps: 0, lastByteAt: 5_000 })
    expect(p.averageBps).toBe(200_000)
    expect(p.complete).toBe(true)
  })

  it('el progreso no pasa de 1 aunque se envíen más bytes que el tamaño', () => {
    const p = downloadProgress({ ...base, bytesSent: 1_200_000, speedBps: 0, lastByteAt: 9_000 })
    expect(p.progress).toBe(1)
  })
})
