import { describe, it, expect } from 'vitest'
import { parseGameFilters, gameFilterQuery } from '@/lib/games/filters'

describe('game list filters keep their state across pages', () => {
  it('keeps the unfindable filter in the query, so page 2 is still filtered', () => {
    const f = parseGameFilters({ meta: 'unfindable', platform: 'snes' })
    const qs = new URLSearchParams(gameFilterQuery(f, { page: '2' }))
    expect(qs.get('meta')).toBe('unfindable')
    expect(parseGameFilters(Object.fromEntries(qs))).toMatchObject({ unfindable: true, platform: 'snes' })
  })
})
