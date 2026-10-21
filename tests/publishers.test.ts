import { describe, it, expect } from 'vitest'
import { publisherKey, rankPublishers } from '@/lib/publishers'

describe('publisherKey', () => {
  it('folds spellings of one company together', () => {
    const keys = ['Ubisoft', 'Ubisoft Entertainment', 'Ubi Soft Entertainment Software'].map(publisherKey)
    expect(new Set(keys).size).toBe(1)
    expect(publisherKey('Activision Publishing')).toBe(publisherKey('Activision'))
    expect(publisherKey('Nintendo')).not.toBe(publisherKey('Sega'))
  })
  it('ignores case, accents and punctuation', () => {
    expect(publisherKey('Square Enix, Ltd.')).toBe(publisherKey('square enix'))
  })
})

describe('rankPublishers', () => {
  const g = (publisher: string | null, score: number | null) => ({ publisher, score })
  it('ranks by the sum of scores and names a group by its commonest spelling', () => {
    const ranked = rankPublishers([
      g('Ubisoft', 60), g('Ubisoft', 60), g('Ubi Soft Entertainment Software', 60),
      g('Capcom', 80), g('Capcom', 80), g('Capcom', 80),
    ])
    expect(ranked.map(r => r.name)).toEqual(['Capcom', 'Ubisoft'])
    expect(ranked[0].weight).toBe(240)
    expect(ranked[1].games).toBe(3)
  })
  it('drops publishers with too few rated games and games without a publisher', () => {
    const ranked = rankPublishers([g('Tiny', 90), g('Tiny', null), g(null, 90), g('', 90)])
    expect(ranked).toEqual([])
  })
})
