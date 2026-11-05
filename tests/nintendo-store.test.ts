import { describe, it, expect } from 'vitest'
import { storeKey, slugKey } from '@/lib/metadata/nintendo-store'

describe('storeKey', () => {
  it('compara títulos sin mayúsculas, acentos ni signos', () => {
    expect(storeKey('30 Birds')).toBe('30-birds')
    expect(storeKey("Five Nights at Freddy's")).toBe('five-nights-at-freddys')
    expect(storeKey('Mario & Luigi')).toBe('mario-and-luigi')
    expect(storeKey('Pokémon Scarlet')).toBe('pokemon-scarlet')
  })
})

describe('slugKey', () => {
  it('saca la clave de la ficha y marca las ediciones Switch 2', () => {
    expect(slugKey('https://www.nintendo.com/us/store/products/30-birds-switch/')).toEqual({ key: '30-birds', switch2: false })
    expect(slugKey('https://www.nintendo.com/us/store/products/30-birds-switch-2/')).toEqual({ key: '30-birds', switch2: true })
  })

  it('ignora fichas sin sufijo de Switch', () => {
    expect(slugKey('https://www.nintendo.com/us/store/products/the-legend-of-zelda-breath-of-the-wild-us/')).toBeNull()
    expect(slugKey('https://www.nintendo.com/us/store/products/splatoon-2-105635/')).toBeNull()
  })
})
