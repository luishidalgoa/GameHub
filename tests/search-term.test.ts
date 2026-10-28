import { describe, expect, it } from 'vitest'
import { SEARCH_MAX_LENGTH, searchTerm } from '@/lib/search'

describe('searchTerm', () => {
  it('trims what the user typed', () => {
    expect(searchTerm('  inazuma  ')).toBe('inazuma')
  })

  it('is empty when there is no search', () => {
    expect(searchTerm(null)).toBe('')
    expect(searchTerm(undefined)).toBe('')
    expect(searchTerm('   ')).toBe('')
  })

  it('is cut to the longest title', () => {
    expect(searchTerm('a'.repeat(SEARCH_MAX_LENGTH + 20))).toHaveLength(SEARCH_MAX_LENGTH)
  })
})
