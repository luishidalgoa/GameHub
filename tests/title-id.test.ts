import { describe, expect, it } from 'vitest'
import { baseApplicationId, servedTitleId, updateTitleIdOf } from '@/lib/scanner/titleid'

const BASE = '01007F600B134000'

describe('herencia del Title ID (#79)', () => {
  it('la actualizacion de un juego es su base con el bit 0x800', () => {
    expect(updateTitleIdOf(BASE)).toBe('01007F600B134800')
  })

  it('desde una actualizacion o un DLC se vuelve al id base', () => {
    expect(baseApplicationId('01007F600B134800')).toBe(BASE)
    expect(baseApplicationId('01007F600B135001')).toBe(BASE)
  })

  it('un DLC nunca hereda el id del juego', () => {
    expect(servedTitleId('dlc', null, BASE)).toBeNull()
  })

  it('una edicion regional hereda el id del juego', () => {
    expect(servedTitleId('region', null, BASE)).toBe(BASE)
  })

  it('la actualizacion sin id propio sale de la regla de actualizacion', () => {
    expect(servedTitleId('update', null, BASE)).toBe('01007F600B134800')
  })
})
