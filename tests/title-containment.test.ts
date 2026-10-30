import { describe, it, expect } from 'vitest'

import { AUTO_THRESHOLD, calcTitleConfidence } from '@/lib/metadata/scoring'

describe('título contenido en el de la base de datos', () => {
  it('acepta «FIFA Soccer 09» para «FIFA 09» cuando la plataforma coincide', () => {
    expect(calcTitleConfidence('FIFA 09', 'FIFA Soccer 09', true)).toBeGreaterThanOrEqual(AUTO_THRESHOLD)
  })

  it('sin plataforma confirmada no acepta el nombre más largo', () => {
    expect(calcTitleConfidence('FIFA 09', 'FIFA Soccer 09', false)).toBeLessThan(AUTO_THRESHOLD)
  })

  it('un título de una sola palabra no se acepta por contención', () => {
    expect(calcTitleConfidence('Mario', 'Mario Kart', true)).toBeLessThan(AUTO_THRESHOLD)
  })

  it('una coincidencia exacta puntúa más que una contenida', () => {
    expect(calcTitleConfidence('FIFA 09', 'FIFA 09', true))
      .toBeGreaterThan(calcTitleConfidence('FIFA 09', 'FIFA Soccer 09', true))
  })

  it('un título sin ninguna palabra en común sigue descartado', () => {
    expect(calcTitleConfidence('Emily My Animal Shelter', 'Emily the Strange Strangerous', true))
      .toBeLessThan(AUTO_THRESHOLD)
  })
})
