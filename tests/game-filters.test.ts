import { describe, it, expect } from 'vitest'
import { parseGameFilters, gameFilterQuery, filterByCompleteness, gameListWhere } from '@/lib/games/filters'

describe('game list filters', () => {
  it('keeps the unfindable filter in the query, so page 2 is still filtered', () => {
    const f = parseGameFilters({ meta: 'unfindable', platform: 'snes' })
    const qs = new URLSearchParams(gameFilterQuery(f, { page: '2' }))
    expect(qs.get('meta')).toBe('unfindable')
    expect(parseGameFilters(Object.fromEntries(qs))).toMatchObject({ unfindable: true, platform: 'snes' })
  })

  it('round-trips the multiple missing fields, the minimum and the state', () => {
    const f = parseGameFilters({ missing: 'cover,score,bogus', meta_min: '40', estado: 'hidden', region: 'EUR' })
    expect(f.missing).toEqual(['cover', 'score'])
    const back = parseGameFilters(Object.fromEntries(new URLSearchParams(gameFilterQuery(f))))
    expect(back).toMatchObject({ missing: ['cover', 'score'], minMeta: 40, state: 'hidden', region: 'EUR' })
  })

  it('filters by the fields a game lacks and by its minimum percentage', () => {
    const base = { coverPath: null, coverUrl: null, description: null, rawgScore: null, releaseYear: null,
      genre: null, developer: null, publisher: null, screenshotPaths: null, trailerUrl: null, region: null }
    const bare = { ...base, id: 1 }
    const rich = { ...base, id: 2, coverPath: 'c', description: 'd', rawgScore: 70, releaseYear: 2000, genre: 'g', developer: 'x', publisher: 'p', screenshotPaths: 's', trailerUrl: 't' }
    const games = [bare, rich]
    expect(filterByCompleteness(games, parseGameFilters({ missing: 'cover' })).map(g => g.id)).toEqual([1])
    expect(filterByCompleteness(games, parseGameFilters({ meta_min: '50' })).map(g => g.id)).toEqual([2])
  })
})

describe('favorito, destacado y oculto como filtros de la lista', () => {
  it('reads the three marks from the URL', () => {
    const f = parseGameFilters({ favorito: '1', destacado: '1', estado: 'hidden' })
    expect(f.favorite).toBe(true)
    expect(f.featured).toBe(true)
    expect(f.state).toBe('hidden')
  })

  it('a missing mark is off, not an error', () => {
    const f = parseGameFilters({})
    expect(f.favorite).toBe(false)
    expect(f.featured).toBe(false)
  })

  it('favorito and destacado narrow the query to those games', () => {
    const w = gameListWhere(parseGameFilters({ favorito: '1', destacado: '1' }))
    expect(w).toMatchObject({ isFavorite: true, isFeatured: true })
  })

  it('round-trips through the query string', () => {
    const q = gameFilterQuery(parseGameFilters({ favorito: '1', destacado: '1' }))
    expect(new URLSearchParams(q).get('favorito')).toBe('1')
    expect(new URLSearchParams(q).get('destacado')).toBe('1')
  })
})
