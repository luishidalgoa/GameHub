import { describe, it, expect } from 'vitest'
import { changedFields, lockFields, parseLocks, stripLocked } from '@/lib/manual-fields'

describe('manual field locks', () => {
  it('reads and merges the stored list', () => {
    expect(parseLocks(null)).toEqual([])
    expect(parseLocks('["genre","publisher"]')).toEqual(['genre', 'publisher'])
    expect(JSON.parse(lockFields('["genre"]', ['publisher', 'genre']))).toEqual(['genre', 'publisher'])
  })
  it('finds only the fields the owner actually changed', () => {
    const before = { developer: 'Capcom', genre: null, releaseYear: 2001 }
    const after = { developer: 'Capcom', genre: 'Action', releaseYear: 2001, title: 'New' }
    expect(changedFields(before, after, ['developer', 'genre', 'releaseYear', 'title'])).toEqual(['genre', 'title'])
  })
  it('strips locked fields from an automatic write and keeps the rest', () => {
    expect(stripLocked({ developer: 'Auto', genre: 'Auto', releaseYear: 2001 }, ['developer']))
      .toEqual({ genre: 'Auto', releaseYear: 2001 })
  })
})
