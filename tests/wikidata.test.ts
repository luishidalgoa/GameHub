import { describe, it, expect } from 'vitest'
import { sameTitleKey } from '@/lib/metadata/wikidata'

describe('sameTitleKey', () => {
  it('matches a title regardless of case, accents and punctuation', () => {
    expect(sameTitleKey('Pokémon: Violet!')).toBe(sameTitleKey('pokemon violet'))
    expect(sameTitleKey('Luigi\'s Mansion')).not.toBe(sameTitleKey('Luigi\'s Mansion 2'))
  })
})
