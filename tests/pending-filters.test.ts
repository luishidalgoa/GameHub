import { describe, it, expect } from 'vitest'
import { pendingWhere, UNFINDABLE } from '@/lib/library'
import { parseGameFilters, gameListWhere } from '@/lib/games/filters'

describe('pending lists leave out games no source can identify', () => {
  it('pendingWhere excludes the unfindable set', () => {
    const w = pendingWhere({ description: null }) as { AND: unknown[] }
    expect(w.AND).toContainEqual({ NOT: UNFINDABLE })
  })
  it('the meta=unfindable filter lists exactly the unfindable games', () => {
    const f = parseGameFilters({ meta: 'unfindable' })
    expect(f.unfindable).toBe(true)
    const where = gameListWhere(f) as Record<string, unknown>
    expect(where).toMatchObject(UNFINDABLE as Record<string, unknown>)
  })
})
