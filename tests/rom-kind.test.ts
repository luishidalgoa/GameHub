import { describe, expect, it } from 'vitest'
import { extraType } from '@/lib/rom-kind'

describe('tipo de fila extra (#78)', () => {
  it('un segundo fichero base es otra edicion, no un update', () => {
    expect(extraType('base')).toBe('region')
  })
  it('update, dlc y mod se conservan', () => {
    expect(extraType('update')).toBe('update')
    expect(extraType('dlc')).toBe('dlc')
    expect(extraType('mod')).toBe('mod')
  })
})
