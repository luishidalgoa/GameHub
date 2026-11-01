import { describe, it, expect } from 'vitest'

import { titleAliasOf } from '@/lib/metadata/title-aliases'

describe('localized titles map to the English name the providers know', () => {
  it('"Jin Samguk Mussang" is Dynasty Warriors, keeping the number', () => {
    expect(titleAliasOf('Jin Samguk Mussang 5')).toBe('Dynasty Warriors 5')
    expect(titleAliasOf("Jin Samguk Mussang DS - Fighter's Battle")).toBe("Dynasty Warriors DS - Fighter's Battle")
  })

  it('the Korean Hyrule Warriors Legends is the English game', () => {
    expect(titleAliasOf('Zelda Mussang - Hyruleui Jeonseoldeul')).toBe('Hyrule Warriors Legends')
  })

  it('an unverified title is left alone', () => {
    expect(titleAliasOf('Zelda Mussang 2')).toBe('Zelda Mussang 2')
    expect(titleAliasOf('Super Mario Bros.')).toBe('Super Mario Bros.')
  })
})
