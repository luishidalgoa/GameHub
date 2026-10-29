import { describe, it, expect } from 'vitest'
import { groupAttempts, positionOf, type AttemptRecord } from '@/lib/traffic-stats'

const now = 10_000_000
const attempt = (over: Partial<AttemptRecord>): AttemptRecord => ({
  id: 1, key: 'k', fileSize: 1000, bytesSent: 0, position: 0, startedAt: 0, lastByteAt: 0, completed: false, untracked: false, ...over,
})

describe('positionOf', () => {
  it('usa la posición medida, y los bytes enviados para las filas anteriores a ella', () => {
    expect(positionOf(700, 100)).toBe(700)
    expect(positionOf(0, 100)).toBe(100)
  })
})

describe('groupAttempts', () => {
  it('une los intentos de una misma descarga y toma la posición más lejana', () => {
    const groups = groupAttempts([
      attempt({ id: 1, key: 'a', position: 600, bytesSent: 600, startedAt: 0, lastByteAt: now - 20 * 60_000 }),
      attempt({ id: 2, key: 'a', position: 1000, bytesSent: 400, startedAt: now - 15 * 60_000, lastByteAt: now - 10 * 60_000 }),
    ], now)
    expect(groups).toHaveLength(1)
    expect(groups[0].attempts).toBe(2)
    expect(groups[0].position).toBe(1000)
    expect(groups[0].bytesSent).toBe(1000)
    expect(groups[0].latestId).toBe(2)
    expect(groups[0].state).toBe('complete')
  })

  it('sin bytes hace menos de 30 minutos es en pausa, y después cortada', () => {
    const paused = groupAttempts([attempt({ position: 300, bytesSent: 300, lastByteAt: now - 5 * 60_000 })], now)
    expect(paused[0].state).toBe('paused')
    const cut = groupAttempts([attempt({ position: 300, bytesSent: 300, lastByteAt: now - 2 * 60 * 60_000 })], now)
    expect(cut[0].state).toBe('cut')
  })

  it('con bytes en el último minuto es activa', () => {
    const groups = groupAttempts([attempt({ position: 300, bytesSent: 300, lastByteAt: now - 5_000 })], now)
    expect(groups[0].state).toBe('active')
  })

  it('separa descargas distintas aunque compartan juego', () => {
    const groups = groupAttempts([
      attempt({ id: 1, key: 'juego', lastByteAt: now - 1000 }),
      attempt({ id: 2, key: 'dlc', lastByteAt: now - 2000 }),
    ], now)
    expect(groups).toHaveLength(2)
  })

  it('una descarga de la cola sin contador y terminada cuenta como completa, con su tamaño', () => {
    const groups = groupAttempts([
      attempt({ id: 9, position: 0, bytesSent: 0, fileSize: 4000, completed: true, untracked: true, startedAt: 0, lastByteAt: now - 40 * 60_000 }),
    ], now)
    expect(groups[0].state).toBe('complete')
    expect(groups[0].position).toBe(4000)
  })

  it('la transferencia suma lo que estuvo activo cada intento, sin la pausa entre ellos', () => {
    const groups = groupAttempts([
      attempt({ id: 1, key: 'a', position: 400, bytesSent: 400, startedAt: 0, lastByteAt: 20_000 }),
      attempt({ id: 2, key: 'a', position: 1000, bytesSent: 600, startedAt: 2 * 3_600_000, lastByteAt: 2 * 3_600_000 + 40_000 }),
    ], now)
    expect(groups[0].transferSeconds).toBe(60)
  })
})
