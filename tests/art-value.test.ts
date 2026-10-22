import { describe, it, expect } from 'vitest'
import { hasRichMetadata, isValuableForArt, RICH_DESCRIPTION_MIN } from '@/lib/art-value'

const rich = { description: 'x'.repeat(RICH_DESCRIPTION_MIN), releaseYear: 2001, developer: 'Dev', genre: 'Action', rawgAdded: null }

describe('what makes a game worth manual art', () => {
  it('needs all four metadata fields, with a real description', () => {
    expect(hasRichMetadata(rich)).toBe(true)
    expect(hasRichMetadata({ ...rich, description: 'x'.repeat(RICH_DESCRIPTION_MIN - 1) })).toBe(false)
    expect(hasRichMetadata({ ...rich, releaseYear: null })).toBe(false)
    expect(hasRichMetadata({ ...rich, developer: '  ' })).toBe(false)
    expect(hasRichMetadata({ ...rich, genre: null })).toBe(false)
  })

  it('is valuable when it is popular on RAWG or was downloaded', () => {
    expect(isValuableForArt({ ...rich, rawgAdded: 5 }, false)).toBe(true)
    expect(isValuableForArt(rich, true)).toBe(true)
    expect(isValuableForArt(rich, false)).toBe(false)
  })

  it('a popular game with thin metadata is not valuable', () => {
    expect(isValuableForArt({ ...rich, description: 'corta', rawgAdded: 900 }, true)).toBe(false)
  })
})
