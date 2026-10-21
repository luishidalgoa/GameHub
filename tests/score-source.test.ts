import { describe, expect, it } from 'vitest'
import { ratingBadge, unifiedScore } from '@/lib/metadata/popularity'

describe('nota de RAWG (#80)', () => {
  it('la nota de critica sale como metacritic', () => {
    expect(ratingBadge({ rawgMetacritic: 82, rawgRating: 4.1 })).toMatchObject({ value: 82, source: 'meta' })
  })
  it('sin critica, la nota de usuario se escala x20 y es de usuario', () => {
    expect(unifiedScore({ rawgRating: 4.1 })).toBe(82)
    expect(ratingBadge({ rawgRating: 4.1 })).toMatchObject({ value: 82, source: 'user' })
  })
})
