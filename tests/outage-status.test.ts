import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { update } = vi.hoisted(() => ({ update: vi.fn(async () => ({})) }))
vi.mock('@/lib/db', () => ({
  db: {
    game: {
      findUnique: vi.fn(async () => ({ title: 'Some Unknown Game', developer: null, publisher: null, releaseYear: null, genre: null })),
      update,
    },
    setting: { findUnique: vi.fn(async () => null) },
  },
}))
vi.mock('@/lib/metadata/apply', () => ({ applyMetadata: vi.fn(async () => ({})) }))

import { fetchHtmlWithRetry, type HtmlFetchPolicy } from '@/lib/metadata/http'
import { fillGameFacts } from '@/lib/metadata/wikidata'

const LAUNCHBOX: HtmlFetchPolicy = {
  userAgent: 'test',
  backoffsMs: [0, 0],
  failOnStatus: true,
  throwOnError: true,
  label: 'LaunchBox',
}

describe('provider outages are not empty answers', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('throws when LaunchBox keeps answering 503 after every retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })))
    await expect(fetchHtmlWithRetry('https://example.test/x', LAUNCHBOX)).rejects.toThrow(/LaunchBox 503/)
  })

  it('still returns an empty string for a provider that does not throw on errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })))
    const soft: HtmlFetchPolicy = { ...LAUNCHBOX, throwOnError: false, failOnStatus: false, label: 'Metacritic' }
    await expect(fetchHtmlWithRetry('https://example.test/x', soft)).resolves.toBe('')
  })
})

describe('Wikidata never writes the metadata status', () => {
  beforeEach(() => { update.mockClear() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('leaves a no_match game alone when Wikidata has nothing for it', async () => {
    // Wikidata's search answers with no hits, so there are no facts to fill.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ search: [] }), { status: 200 })))
    await expect(fillGameFacts(1)).resolves.toEqual([])
    expect(update).not.toHaveBeenCalled()
  })
})
