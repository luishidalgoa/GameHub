import { describe, it, expect } from 'vitest'

import { planVariantFold } from '@/lib/external/variants'

describe('plegado de variantes de un catálogo torrent', () => {
  it('pliega las ediciones de Akiba\'s Beat bajo el juego base', () => {
    const plan = planVariantFold([
      { id: 1, rawTitle: 'Akiba&#39;s Beat' },
      { id: 2, rawTitle: 'Akiba&#39;s Beat - Butler Mizuki' },
      { id: 3, rawTitle: 'Akiba&#39;s Beat - Idol - Black Asahi' },
    ])
    expect(plan.get(2)).toBe(1)
    expect(plan.get(3)).toBe(1)
    expect(plan.has(1)).toBe(false)
  })

  it('pliega en el prefijo más largo que sea una base', () => {
    const plan = planVariantFold([
      { id: 1, rawTitle: 'Senran Kagura Shinovi Versus' },
      { id: 2, rawTitle: 'Senran Kagura' },
      { id: 3, rawTitle: 'Senran Kagura - Shinovi Versus - Asuka' },
    ])
    expect(plan.get(3)).toBe(1)
  })

  it('una variante sin base se queda como juego propio', () => {
    const plan = planVariantFold([
      { id: 5, rawTitle: 'Ore no Shikabane o Koete Yuke - Akiba 48 Bosatsu' },
      { id: 6, rawTitle: 'Akiba\'s Trip' },
    ])
    expect(plan.size).toBe(0)
  })

  it('un título con « - » no sirve de base', () => {
    const plan = planVariantFold([
      { id: 1, rawTitle: 'Akiba\'s Beat - Butler Mizuki' },
      { id: 2, rawTitle: 'Akiba\'s Beat - Butler Mizuki - Extra' },
    ])
    expect(plan.size).toBe(0)
  })

  it('con dos bases del mismo nombre gana la de id menor', () => {
    const plan = planVariantFold([
      { id: 9, rawTitle: 'Persona 5' },
      { id: 4, rawTitle: 'Persona 5' },
      { id: 12, rawTitle: 'Persona 5 - Costume Pack' },
    ])
    expect(plan.get(12)).toBe(4)
  })

  it('no pliega un juego en sí mismo', () => {
    const plan = planVariantFold([{ id: 1, rawTitle: 'Mario Kart - Mario Kart' }])
    expect(plan.has(1)).toBe(false)
  })
})
