import { describe, it, expect } from 'vitest'
import { completeness, FIELD_WEIGHTS, type CompletenessInput } from '@/lib/games/completeness'

const empty: CompletenessInput = {
  coverPath: null, coverUrl: null, description: null, rawgScore: null, releaseYear: null,
  genre: null, developer: null, publisher: null, screenshotPaths: null, trailerUrl: null,
}
const full: CompletenessInput = {
  coverPath: 'covers/a.webp', coverUrl: null, description: 'Un juego', rawgScore: 80, releaseYear: 2001,
  genre: 'Acción', developer: 'Dev', publisher: 'Pub', screenshotPaths: '["a.webp"]', trailerUrl: 'https://v',
}

describe('metadata completeness', () => {
  it('weights add up to 100', () => {
    expect(FIELD_WEIGHTS.reduce((n, f) => n + f.weight, 0)).toBe(100)
  })
  it('an empty game is 0 % and misses everything', () => {
    expect(completeness(empty)).toEqual({ percent: 0, missing: FIELD_WEIGHTS.map(f => f.key) })
  })
  it('a full game is 100 % and misses nothing', () => {
    expect(completeness(full)).toEqual({ percent: 100, missing: [] })
  })
  it('a cover from a URL counts, and blank text does not', () => {
    const r = completeness({ ...empty, coverUrl: 'https://c', description: '   ' })
    expect(r.percent).toBe(20)
    expect(r.missing).not.toContain('cover')
    expect(r.missing).toContain('description')
  })
})
