import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: { setting: { findUnique: vi.fn(async () => null) } } }))

import { belowMinimum, clientVersionOf, parseVersion } from '@/lib/client-gate'

describe('clientVersionOf', () => {
  it('saca la versión de GameHubNX', () => {
    expect(clientVersionOf('GameHubNX/1.1.0')).toBe('1.1.0')
    expect(clientVersionOf('GameHubNX/1.0.0 extra')).toBe('1.0.0')
  })

  it('un navegador u otro cliente no tiene versión de GameHubNX', () => {
    expect(clientVersionOf('Mozilla/5.0')).toBeNull()
    expect(clientVersionOf(null)).toBeNull()
  })
})

describe('parseVersion', () => {
  it('completa con ceros y rechaza lo que no es una versión', () => {
    expect(parseVersion('1.2')).toEqual([1, 2, 0])
    expect(parseVersion('dev')).toBeNull()
    expect(parseVersion('1.x.0')).toBeNull()
  })
})

describe('belowMinimum', () => {
  it('sin mínimo nunca bloquea', () => {
    expect(belowMinimum('1.0.0', '')).toBe(false)
    expect(belowMinimum('1.0.0', '   ')).toBe(false)
  })

  it('compara número a número, no como texto', () => {
    expect(belowMinimum('1.0.0', '1.1.0')).toBe(true)
    expect(belowMinimum('1.1.0', '1.1.0')).toBe(false)
    expect(belowMinimum('1.10.0', '1.9.0')).toBe(false)
    expect(belowMinimum('0.9.9', '1.0.0')).toBe(true)
  })

  it('una versión desconocida cuenta como anterior cuando hay mínimo', () => {
    expect(belowMinimum('dev', '1.1.0')).toBe(true)
  })

  it('un mínimo mal escrito no bloquea a nadie', () => {
    expect(belowMinimum('1.0.0', 'abc')).toBe(false)
  })
})
