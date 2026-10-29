import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { selectionWhere } from '@/lib/metadata/selection'
import { YouTubeApiError } from '@/lib/youtube'

const now = new Date('2026-10-29T12:00:00Z')

describe('YouTube apagado: el tráiler no es un hueco', () => {
  it('en fill, un pase solo de tráiler no selecciona nada cuando YouTube está apagado', () => {
    expect(selectionWhere({ mode: 'fill', fields: ['trailer'], backfillTrailers: true, trailersOff: true, popularityRedo: false, now })).toBeNull()
  })

  it('en fill sí selecciona por tráiler cuando YouTube funciona', () => {
    expect(selectionWhere({ mode: 'fill', fields: ['trailer'], backfillTrailers: true, popularityRedo: false, now })).not.toBeNull()
  })

  it('en missing sin ficha, el tráiler no entra en la selección cuando YouTube está apagado', () => {
    expect(selectionWhere({ mode: 'missing', fields: ['trailer'], backfillTrailers: true, trailersOff: true, popularityRedo: false, now })).toBeNull()
  })
})

describe('error de YouTube', () => {
  it('una respuesta HTTP lleva su código', () => {
    expect(new YouTubeApiError('HTTP 403', 403).httpStatus).toBe(403)
  })

  it('un fallo de red no lleva código, así que no apaga YouTube durante un día', () => {
    expect(new YouTubeApiError('network error: timeout').httpStatus).toBeUndefined()
  })
})
