import { describe, expect, it } from 'vitest'
import { canMove } from '@/lib/queue-status'

describe('estados de token (#82)', () => {
  it('el camino normal es waiting -> ready -> downloading -> done', () => {
    expect(canMove('waiting', 'ready')).toBe(true)
    expect(canMove('ready', 'downloading')).toBe(true)
    expect(canMove('downloading', 'done')).toBe(true)
  })
  it('un token caducado no vuelve a ningun estado', () => {
    expect(canMove('expired', 'ready')).toBe(false)
    expect(canMove('expired', 'downloading')).toBe(false)
  })
  it('un corte deja done y el reintento vuelve a downloading (#120)', () => {
    expect(canMove('done', 'downloading')).toBe(true)
  })
  it('no se puede saltar de waiting a done', () => {
    expect(canMove('waiting', 'done')).toBe(false)
  })
})
