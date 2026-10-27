import { describe, it, expect } from 'vitest'
import { lowQualityFields, wrongProvenanceFields, coverScaleOf, DESCRIPTION_MIN_CHARS, SCREENSHOTS_MIN } from '@/lib/metadata/field-quality'
import { DEFAULT_CHAINS } from '@/lib/metadata/chains'

const box = { thumbnailWidth: 200, thumbnailHeight: 300 }   // a good cover is 400×600
const game = (over: Partial<Parameters<typeof lowQualityFields>[0]> = {}) => ({
  coverPath: 'covers/x/1.webp', coverUrl: null, coverWidth: 600, coverHeight: 900,
  description: 'x'.repeat(DESCRIPTION_MIN_CHARS), screenshotPaths: JSON.stringify(['a', 'b', 'c']),
  platform: box, ...over,
})

describe('the quality of a cover is its size against the platform box', () => {
  it('twice the box on each side is good', () => {
    expect(coverScaleOf(400, 600, box)).toBe(1)
    expect(coverScaleOf(300, 450, box)).toBeLessThan(1)
  })

  it('a cover that is too small is low quality; a good one is not', () => {
    expect(lowQualityFields(game({ coverWidth: 300, coverHeight: 450 }), ['cover'])).toEqual(['cover'])
    expect(lowQualityFields(game(), ['cover'])).toEqual([])
  })

  it('a cover whose size was never measured is low quality, and so is a missing one', () => {
    expect(lowQualityFields(game({ coverWidth: null, coverHeight: null }), ['cover'])).toEqual(['cover'])
    expect(lowQualityFields(game({ coverPath: null, coverUrl: null }), ['cover'])).toEqual(['cover'])
  })
})

describe('the other fields', () => {
  it('a short description is low quality', () => {
    expect(lowQualityFields(game({ description: 'x'.repeat(DESCRIPTION_MIN_CHARS - 1) }), ['description'])).toEqual(['description'])
    expect(lowQualityFields(game({ description: null }), ['description'])).toEqual(['description'])
  })

  it('fewer than the minimum screenshots is low quality', () => {
    expect(SCREENSHOTS_MIN).toBe(3)
    expect(lowQualityFields(game({ screenshotPaths: JSON.stringify(['a', 'b']) }), ['screenshots'])).toEqual(['screenshots'])
    expect(lowQualityFields(game({ screenshotPaths: null }), ['screenshots'])).toEqual(['screenshots'])
  })

  it('only the fields asked are judged', () => {
    expect(lowQualityFields(game({ coverWidth: 1, coverHeight: 1 }), ['description'])).toEqual([])
  })
})

describe('a field whose source is outside the platform chain is wrong', () => {
  const chains = DEFAULT_CHAINS

  it('a cover from a fallback in the chain is right: a small cover moves to the next source by design', () => {
    expect(wrongProvenanceFields({ cover: 'steamgriddb' }, ['cover'], chains)).toEqual([])
  })

  it('a cover from a source outside the chain is wrong', () => {
    expect(wrongProvenanceFields({ cover: 'nintendo' }, ['cover'], chains)).toEqual(['cover'])
  })

  it('a hand-picked cover is never wrong', () => {
    expect(wrongProvenanceFields({ cover: 'nintendo', coverManual: true }, ['cover'], chains)).toEqual([])
  })

  it('a missing source is wrong, unless the chain asks for nothing', () => {
    expect(wrongProvenanceFields({}, ['description'], chains)).toEqual(['description'])
    expect(wrongProvenanceFields({}, ['description'], { ...chains, description: [] })).toEqual([])
  })

  it('a fact takes its own provenance, and Nintendo is the info fallback on Switch', () => {
    expect(wrongProvenanceFields({ facts: { genre: 'rawg' } }, ['genre'], { ...chains, info: ['launchbox'] })).toEqual(['genre'])
    expect(wrongProvenanceFields({ info: 'nintendo' }, ['releaseYear'], { ...chains, info: ['launchbox'] })).toEqual([])
  })

  it('only the fields asked are judged, so a correct field of a wrong game is left alone', () => {
    expect(wrongProvenanceFields({ cover: 'nintendo', description: 'launchbox' }, ['description'], chains)).toEqual([])
  })
})
