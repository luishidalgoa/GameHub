import { describe, it, expect } from 'vitest'
import { NOT_UNFINDABLE } from '@/lib/library'
import { BATCH_MODES, FIELD_SCOPES, effectiveScope, reachOf, runScope, type BatchMode, type FieldScope } from '@/lib/metadata/scope'
import { selectionWhere, gapColumnsFor } from '@/lib/metadata/selection'

const now = new Date('2026-10-27T12:00:00Z')

const base = { withTrailers: true, withScores: true, backfillTrailers: true, popularityRedo: false, now }

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
  type Reach = 'all' | 'gaps' | 'none'

  for (const mode of BATCH_MODES) {
    it(`${mode} reaches its categories as drawn`, () => {
      expect(FIELD_SCOPES.map(f => reachOf(mode, f))).toEqual(expected[mode])
    })
  }
})

describe('the categories a pass writes', () => {
  it('a mode runs every category it applies to by default', () => {
    expect(effectiveScope('missing')).toEqual(['ficha', 'imagenes', 'notas', 'multimedia'])
    expect(effectiveScope('wrong-provider')).toEqual(['ficha', 'imagenes'])
    expect(effectiveScope('popularity')).toEqual(['notas'])
  })

  it('a requested list keeps only the categories the mode applies to', () => {
    expect(effectiveScope('wrong-provider', ['notas', 'ficha'])).toEqual(['ficha'])
    expect(effectiveScope('popularity', ['ficha'])).toEqual([])
  })

  it('an explicit empty list selects nothing', () => {
    expect(effectiveScope('missing', [])).toEqual([])
  })
})

describe('the selection of a pass', () => {
  it('an empty scope selects nothing', () => {
    expect(selectionWhere({ mode: 'missing', scope: [], ...base })).toBeNull()
  })

  it('every pass leaves out unfindable games', () => {
    const scope: FieldScope[] = ['ficha']
    for (const mode of ['missing', 'fill', 'redo', 'wrong-provider'] as const) {
      const w = selectionWhere({ mode, scope, ...base })
      expect(text(w)).toContain(text(NOT_UNFINDABLE))
    }
  })

  it('fill looks only at the gaps of the categories in scope', () => {
    const w = text(selectionWhere({ mode: 'fill', scope: ['ficha'], ...base }))
    expect(w).toContain('"description":null')
    expect(w).toContain('"releaseDate":null')
    expect(w).not.toContain('"coverPath":null')
    expect(w).not.toContain('"trailerUrl":null')
  })

  it('fill with only trailers looks at trailers alone', () => {
    const w = text(selectionWhere({ mode: 'fill', scope: ['multimedia'], ...base }))
    expect(w).toContain('"trailerUrl":null')
    expect(w).not.toContain('"description":null')
  })

  it('fill with no gap to look at selects nothing', () => {
    expect(selectionWhere({ mode: 'fill', scope: ['multimedia'], ...base, withTrailers: false })).toBeNull()
  })

  it('missing with trailers also takes games that only lack a trailer', () => {
    const w = text(selectionWhere({ mode: 'missing', scope: ['ficha', 'multimedia'], ...base }))
    expect(w).toContain('"trailerUrl":null')
  })

  it('missing without the trailer category does not take trailer-only games', () => {
    const w = text(selectionWhere({ mode: 'missing', scope: ['ficha'], ...base }))
    expect(w).not.toContain('"trailerUrl":null')
  })

  it('a platform filter keeps the library rule that the platform is enabled', () => {
    const w = text(selectionWhere({ mode: 'redo', scope: ['ficha'], platformSlug: 'psx', ...base }))
    expect(w).toContain('"enabled":true')
    expect(w).toContain('"slug":"psx"')
  })

  it('popularity keeps its idempotency marker unless it is asked to redo', () => {
    const once = text(selectionWhere({ mode: 'popularity', scope: ['notas'], ...base }))
    const redo = text(selectionWhere({ mode: 'popularity', scope: ['notas'], ...base, popularityRedo: true }))
    expect(once).toContain('"popularityFetchedAt":null')
    expect(redo).not.toContain('"popularityFetchedAt":null')
  })
})

describe('the gap columns of a fill pass', () => {
  it('lists the fields of each category in scope', () => {
    const all: FieldScope[] = [...FIELD_SCOPES]
    expect(gapColumnsFor(all, true, true)).toEqual(
      expect.arrayContaining(['description', 'releaseDate', 'coverPath', 'screenshotPaths', 'rawgScore', 'trailerUrl']),
    )
  })

  it('leaves out scores and trailers when they are switched off', () => {
    const all: FieldScope[] = [...FIELD_SCOPES]
    expect(gapColumnsFor(all, false, false)).not.toEqual(expect.arrayContaining(['rawgScore', 'trailerUrl']))
  })
})

describe('one run scope for the engine, the preview and the panel', () => {
  it('turning scores off removes the score category, except for the score-only modes', () => {
    expect(runScope('redo', undefined, { withTrailers: true, withScores: false })).not.toContain('notas')
    expect(runScope('popularity', undefined, { withTrailers: true, withScores: false })).toEqual(['notas'])
  })

  it('turning trailers off removes the multimedia category', () => {
    expect(runScope('missing', undefined, { withTrailers: false, withScores: true })).not.toContain('multimedia')
  })
})

describe('retry timing and the pending state of a pass without the ficha', () => {
  it('every selection leaves out games still waiting for a retry', () => {
    for (const mode of ['missing', 'fill', 'redo', 'popularity'] as const) {
      const w = text(selectionWhere({ mode, scope: ['ficha', 'notas'], ...base }))
      expect(w).toContain('"metadataNextRetryAt"')
    }
  })

  it('missing without the ficha targets pending games that lack something in scope', () => {
    const w = text(selectionWhere({ mode: 'missing', scope: ['imagenes'], ...base }))
    expect(w).toContain('"coverPath":null')
    expect(w).toContain('"metadataStatus"')
  })
})
