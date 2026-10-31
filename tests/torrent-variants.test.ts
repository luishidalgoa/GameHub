import { describe, it, expect } from 'vitest'

import { planFold, planVariantFold } from '@/lib/external/variants'

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

  it('un título con « - » en su propio nombre sirve de base para sus variantes', () => {
    const plan = planVariantFold([
      { id: 1, rawTitle: 'Akiba&#39;s Trip - Undead &amp; Undressed' },
      { id: 2, rawTitle: 'Akiba&#39;s Trip - Undead &amp; Undressed - Kati&#39;s Swimwear' },
      { id: 3, rawTitle: 'Akiba&#39;s Trip - Undead &amp; Undressed - Prinny - Disgaea' },
    ])
    expect(plan.get(2)).toBe(1)
    expect(plan.get(3)).toBe(1)
    expect(plan.has(1)).toBe(false)
  })

  it('una variante de una variante sube hasta la raíz visible', () => {
    const plan = planVariantFold([
      { id: 1, rawTitle: 'Akiba\'s Beat - Butler Mizuki' },
      { id: 2, rawTitle: 'Akiba\'s Beat - Butler Mizuki - Extra' },
      { id: 3, rawTitle: 'Akiba\'s Beat' },
    ])
    expect(plan.get(1)).toBe(3)
    expect(plan.get(2)).toBe(3)
    expect(plan.has(3)).toBe(false)
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

describe('mismo juego para LaunchBox', () => {
  const game = (id: number, over: Partial<Parameters<typeof planFold>[0][number]> = {}) => ({
    id, rawTitle: 'Pro Evolution Soccer 5', source: 'torrent', isHidden: false, launchboxId: 42, hasCover: true, ...over,
  })

  it('filas torrent con el mismo ID de LaunchBox van bajo la que tiene portada', () => {
    const plan = planFold([game(1, { hasCover: false }), game(2), game(3, { rawTitle: 'PES 5 Spanish' })])
    expect(plan.get(1)).toBe(2)
    expect(plan.get(3)).toBe(2)
    expect(plan.has(2)).toBe(false)
  })

  it('la local manda sobre las torrent del mismo ID', () => {
    const plan = planFold([game(1), game(2, { source: 'local', rawTitle: 'Pro Evolution Soccer 5.chd' })])
    expect(plan.get(1)).toBe(2)
    expect(plan.has(2)).toBe(false)
  })

  it('sin ninguna fila visible en el grupo no se pliega nada', () => {
    const plan = planFold([game(1, { isHidden: true }), game(2, { isHidden: true })])
    expect(plan.size).toBe(0)
  })

  it('sin ID de LaunchBox, las filas con el mismo nombre van bajo la que tiene portada', () => {
    const plan = planFold([
      game(1, { rawTitle: 'The - Kosmos', launchboxId: null, hasCover: false }),
      game(2, { rawTitle: 'The - Kosmos', launchboxId: null }),
      game(3, { rawTitle: 'The - Kosmos', launchboxId: null, hasCover: false }),
    ])
    expect(plan.get(1)).toBe(2)
    expect(plan.get(3)).toBe(2)
    expect(plan.has(2)).toBe(false)
  })

  it('sin ID de LaunchBox, nombres distintos no se agrupan', () => {
    const plan = planFold([
      game(1, { rawTitle: 'Get Up', launchboxId: null }),
      game(2, { rawTitle: 'Get Out There', launchboxId: null }),
    ])
    expect(plan.size).toBe(0)
  })

  it('sin ID de LaunchBox y sin visibles no se pliega nada', () => {
    const plan = planFold([
      game(1, { rawTitle: 'Get Up', launchboxId: null, isHidden: true }),
      game(2, { rawTitle: 'Get Up', launchboxId: null, isHidden: true }),
    ])
    expect(plan.size).toBe(0)
  })

  it('una variante por nombre cuya raíz se agrupa después sube hasta la nueva raíz', () => {
    const plan = planFold([
      game(1, { rawTitle: 'Game', hasCover: false }),
      game(2, { rawTitle: 'Game - Extra' }),
      game(3, { rawTitle: 'Game Remaster' }),
    ])
    expect(plan.get(1)).toBe(3)
    expect(plan.get(2)).toBe(3)
    expect(plan.has(3)).toBe(false)
  })
})
