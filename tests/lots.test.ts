import { describe, it, expect } from 'vitest'
import { splitLot } from '@/lib/external/lots'

describe('splitLot', () => {
  it('divide un lote por comas en juegos sueltos', () => {
    expect(splitLot('Fantasista Asuka, Magical Nut Ikuno Crystal Combi Collection'))
      .toEqual(['Fantasista Asuka', 'Magical Nut Ikuno Crystal Combi Collection'])
    expect(splitLot('Okayu Nyumu / Bomber Crew')).toEqual(['Okayu Nyumu', 'Bomber Crew'])
  })

  it('no divide cuando una parte es un número suelto', () => {
    expect(splitLot('Disgaea 1, 4, 5: Complete')).toBeNull()
  })

  it('no divide un rango: esa parte son varios juegos', () => {
    expect(splitLot('Super Woden GP 1-2 , Rally Edge')).toBeNull()
  })

  it('no divide un juego con + o & ni una lista con partes de una palabra', () => {
    expect(splitLot('Heretic + Hexen')).toBeNull()
    expect(splitLot('Miles & Kilo')).toBeNull()
    expect(splitLot('Minesweeper Genius, Classic, Neon Mine')).toBeNull()
    expect(splitLot('Pixel Game Maker Series, 48 игр')).toBeNull()
    expect(splitLot('The NOexistenceN of You, and Me')).toBeNull()
  })

  it('una sola coma sin marca de pack es un título', () => {
    expect(splitLot('Little Kitty, Big City')).toBeNull()
    expect(splitLot('Good Pizza, Great Pizza')).toBeNull()
    expect(splitLot('Final Light, The Prison')).toBeNull()
  })

  it('no divide un título sin separadores', () => {
    expect(splitLot('Minecraft Legends')).toBeNull()
  })

  it('no divide cuando una parte es «и др.»', () => {
    expect(splitLot('Sonic, Tails и др.')).toBeNull()
    expect(splitLot('Shining Force III, Earthworm Jim 2, Sonic R и др.')).toBeNull()
  })
})
