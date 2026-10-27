import { describe, it, expect } from 'vitest'
import { NOT_UNFINDABLE } from '@/lib/library'
import {
  BATCH_FIELDS, BATCH_MODES, FIELD_SCOPES, MODE_APPLIES, MODE_FIELDS,
  effectiveFields, reachOf, runFields, type BatchField, type BatchMode, type Reach,
} from '@/lib/metadata/scope'
import { selectionWhere, gapColumnsFor } from '@/lib/metadata/selection'

const now = new Date('2026-10-27T12:00:00Z')

const base = { backfillTrailers: true, popularityRedo: false, now }

/** Serialised where, so a test can look for a clause without knowing its exact nesting. */
const text = (w: unknown) => JSON.stringify(w)

describe('the mode-by-category matrix matches the panel', () => {
  // ● all, ○ gaps, — none, in the order Ficha, Imágenes, Notas, Multimedia.
  const expected: Record<BatchMode, Reach[]> = {
    'missing':             ['all',  'all',  'all',  'all'],
    'fill':                ['gaps', 'gaps', 'gaps', 'gaps'],
    'redo':                ['all',  'all',  'all',  'all'],
    'wrong-provider':      ['all',  'all',  'none', 'none'],
    'popularity':          ['none', 'none', 'all',  'none'],
    'autocomplete-scores': ['none', 'none', 'all',  'none'],
  }

  for (const mode of BATCH_MODES) {
    it(`${mode} reaches its categories as drawn`, () => {
      expect(FIELD_SCOPES.map(c => reachOf(mode, c))).toEqual(expected[mode])
    })
  }
})

describe('the fields a mode allows', () => {
  it('the full-flow modes never allow RAWG rating or popularity', () => {
    for (const mode of ['missing', 'fill', 'redo'] as const) {
      expect(MODE_FIELDS[mode]).not.toContain('rating')
      expect(MODE_FIELDS[mode]).not.toContain('popularity')
    }
  })

  it('wrong-provider only touches the ficha and the cover and screenshots it judges', () => {
    expect([...MODE_FIELDS['wrong-provider']].sort()).toEqual(
      ['title', 'description', 'genre', 'developer', 'publisher', 'releaseYear', 'releaseDate', 'cover', 'screenshots'].sort(),
    )
  })

  it('a mode without a field of a category does not reach that category', () => {
    expect(MODE_APPLIES['popularity']).toEqual(['notas'])
    expect(MODE_APPLIES['autocomplete-scores']).toEqual(['notas'])
  })

  it('a request keeps only the fields the mode allows, in the order of the catalogue', () => {
    expect(effectiveFields('wrong-provider', ['score', 'genre', 'cover'])).toEqual(['genre', 'cover'])
    expect(effectiveFields('popularity', ['genre'])).toEqual([])
  })

  it('an explicit empty list selects nothing', () => {
    expect(effectiveFields('missing', [])).toEqual([])
  })

  it('every field belongs to one mode at least', () => {
    for (const f of BATCH_FIELDS) {
      expect(BATCH_MODES.some(m => MODE_FIELDS[m].includes(f))).toBe(true)
    }
  })
})

describe('the run fields: the switches take out what they turn off', () => {
  it('turning scores off removes the score fields, except for the score-only modes', () => {
    const off = { withTrailers: true, withScores: false }
    expect(runFields('redo', undefined, off)).not.toContain('score')
    expect(runFields('redo', undefined, off)).not.toContain('metacritic')
    expect(runFields('autocomplete-scores', undefined, off)).toEqual(['score', 'metacritic'])
  })

  it('turning trailers off removes the trailer', () => {
    expect(runFields('missing', undefined, { withTrailers: false, withScores: true })).not.toContain('trailer')
  })
})

describe('the selection of a pass', () => {
  it('no field selects nothing', () => {
    expect(selectionWhere({ mode: 'missing', fields: [], ...base })).toBeNull()
  })

  it('every pass leaves out unfindable games', () => {
    for (const mode of ['missing', 'fill', 'redo', 'wrong-provider'] as const) {
      const w = selectionWhere({ mode, fields: ['description'], ...base })
      expect(text(w)).toContain(text(NOT_UNFINDABLE))
    }
  })

  it('fill looks only at the gaps of the fields chosen', () => {
    const w = text(selectionWhere({ mode: 'fill', fields: ['description', 'releaseDate'], ...base }))
    expect(w).toContain('"description":null')
    expect(w).toContain('"releaseDate":null')
    expect(w).not.toContain('"coverPath":null')
    expect(w).not.toContain('"trailerUrl":null')
  })

  it('fill on the logo looks at the logo alone', () => {
    const w = text(selectionWhere({ mode: 'fill', fields: ['logo'], ...base }))
    expect(w).toContain('"logoPath":null')
    expect(w).not.toContain('"description":null')
  })

  it('fill with only the trailer looks at trailers alone', () => {
    const w = text(selectionWhere({ mode: 'fill', fields: ['trailer'], ...base }))
    expect(w).toContain('"trailerUrl":null')
    expect(w).not.toContain('"description":null')
  })

  it('missing with the trailer also takes games that only lack a trailer', () => {
    const w = text(selectionWhere({ mode: 'missing', fields: ['description', 'trailer'], ...base }))
    expect(w).toContain('"trailerUrl":null')
  })

  it('missing without the trailer does not take trailer-only games', () => {
    const w = text(selectionWhere({ mode: 'missing', fields: ['description'], ...base }))
    expect(w).not.toContain('"trailerUrl":null')
  })

  it('a platform filter keeps the library rule that the platform is enabled', () => {
    const w = text(selectionWhere({ mode: 'redo', fields: ['description'], platformSlug: 'psx', ...base }))
    expect(w).toContain('"enabled":true')
    expect(w).toContain('"slug":"psx"')
  })

  it('popularity keeps its idempotency marker unless it is asked to redo', () => {
    const once = text(selectionWhere({ mode: 'popularity', fields: ['rating'], ...base }))
    const redo = text(selectionWhere({ mode: 'popularity', fields: ['rating'], ...base, popularityRedo: true }))
    expect(once).toContain('"popularityFetchedAt":null')
    expect(redo).not.toContain('"popularityFetchedAt":null')
  })

  it('every selection leaves out games still waiting for a retry', () => {
    for (const mode of ['missing', 'fill', 'redo', 'popularity'] as const) {
      const w = text(selectionWhere({ mode, fields: ['description', 'score'], ...base }))
      expect(w).toContain('"metadataNextRetryAt"')
    }
  })

  it('missing without the ficha targets pending games that lack something it writes', () => {
    const w = text(selectionWhere({ mode: 'missing', fields: ['cover'], ...base }))
    expect(w).toContain('"coverPath":null')
    expect(w).toContain('"metadataStatus"')
  })
})

describe('the gap columns of a fill pass', () => {
  it('lists the column each chosen field leaves empty', () => {
    expect(gapColumnsFor(['description', 'cover', 'logo', 'score', 'trailer'])).toEqual(
      ['description', 'coverPath', 'logoPath', 'rawgScore', 'trailerUrl'],
    )
  })

  it('a field with no gap column adds nothing', () => {
    expect(gapColumnsFor(['title'])).toEqual([])
  })
})
