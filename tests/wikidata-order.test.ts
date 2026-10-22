import { describe, it, expect } from 'vitest'
import { readyForWikidata } from '@/lib/metadata/wikidata'

describe('Wikidata runs after the platform providers', () => {
  it('waits until the metadata pass has run on the game', () => {
    expect(readyForWikidata({ metadataFetchedAt: null, metadataStatus: null })).toBe(false)
    expect(readyForWikidata({ metadataFetchedAt: null, metadataStatus: 'matched' })).toBe(false)
  })
  it('is ready once fetched or found nothing', () => {
    expect(readyForWikidata({ metadataFetchedAt: new Date(), metadataStatus: 'matched' })).toBe(true)
    expect(readyForWikidata({ metadataFetchedAt: null, metadataStatus: 'no_match' })).toBe(true)
  })
})
