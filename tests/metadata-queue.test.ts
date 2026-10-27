import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { pendingMetadataWhere, NOT_UNFINDABLE, isRetryCandidate } from '@/lib/library'

const NOW = new Date(Date.UTC(2026, 9, 27, 12))
const DAY = 24 * 3600_000

describe('pending metadata: never tried, or a due retry with no ficha', () => {
  it('keeps the unfindable exclusion and the never-tried clause', () => {
    const w = pendingMetadataWhere(NOW) as { AND: unknown[] }
    expect(w.AND).toContainEqual(NOT_UNFINDABLE)
    const branches = (w.AND[1] as { OR: Array<Record<string, unknown>> }).OR
    expect(branches).toContainEqual({ metadataStatus: null, metadataFetchedAt: null, description: null, genre: null })
  })

  it('the retry branch covers no_match and provider_error only, with a due time', () => {
    const w = pendingMetadataWhere(NOW) as { AND: unknown[] }
    const branches = (w.AND[1] as { OR: Array<Record<string, unknown>> }).OR
    const retry = branches.find(b => 'metadataStatus' in b && b.metadataStatus !== null) as Record<string, unknown>
    expect(retry).toMatchObject({ metadataStatus: { in: ['no_match', 'provider_error'] }, metadataFetchedAt: null, description: null })
    expect(retry.OR).toEqual([{ metadataNextRetryAt: null }, { metadataNextRetryAt: { lte: NOW } }])
  })

  it('never selects a matched game', () => {
    expect(JSON.stringify(pendingMetadataWhere(NOW))).not.toContain('"matched"')
  })

  it('isRetryCandidate needs a retry status and no ficha', () => {
    const bare = { metadataFetchedAt: null, description: null }
    expect(isRetryCandidate({ metadataStatus: 'no_match', ...bare })).toBe(true)
    expect(isRetryCandidate({ metadataStatus: 'provider_error', ...bare })).toBe(true)
    expect(isRetryCandidate({ metadataStatus: 'matched', ...bare })).toBe(false)
    expect(isRetryCandidate({ metadataStatus: null, ...bare })).toBe(false)
    expect(isRetryCandidate({ metadataStatus: 'no_match', metadataFetchedAt: new Date(), description: null })).toBe(false)
    expect(isRetryCandidate({ metadataStatus: 'no_match', metadataFetchedAt: null, description: 'Texto' })).toBe(false)
  })
})

describe('pending metadata on real rows', () => {
  const PLATFORM = 'test-queue'
  afterAll(async () => {
    await db.game.deleteMany({ where: { platform: { slug: PLATFORM } } })
  })

  it('selects never-tried games and due retries without a ficha, and nothing else', async () => {
    const platform = await db.platform.upsert({
      where: { slug: PLATFORM }, update: {},
      create: { slug: PLATFORM, name: 'Test queue', sortOrder: 997, scanPath: '/test/queue', extensions: '.nes' },
    })
    const base = { fileSize: BigInt(1), platformId: platform.id, fileName: 'q.nes' }
    const past = new Date(Date.now() - DAY)
    const future = new Date(Date.now() + DAY)
    const make = (name: string, data: Record<string, unknown>) =>
      db.game.create({ data: { ...base, filePath: `/test/queue/${name}.nes`, title: name, ...data } })

    const never       = await make('never', {})
    const dueNoMatch  = await make('due-no-match', { metadataStatus: 'no_match', metadataNextRetryAt: past })
    const dueNoTime   = await make('due-no-time', { metadataStatus: 'no_match', metadataNextRetryAt: null })
    const dueGenre    = await make('due-genre', { metadataStatus: 'no_match', metadataNextRetryAt: past, genre: 'RPG' })
    const dueError    = await make('due-error', { metadataStatus: 'provider_error', metadataNextRetryAt: past })
    const waiting     = await make('waiting', { metadataStatus: 'no_match', metadataNextRetryAt: future })
    const withFicha   = await make('ficha', { metadataStatus: 'no_match', metadataNextRetryAt: past, description: 'Texto' })
    const matched     = await make('matched', { metadataStatus: 'matched', metadataFetchedAt: past, metadataNextRetryAt: null })
    const matchedBare = await make('matched-bare', { metadataStatus: 'matched', metadataNextRetryAt: null })
    const unfindable  = await make('unfindable', { artStatus: 'no-match', metadataStatus: 'no_match', metadataNextRetryAt: past })

    const found = await db.game.findMany({
      where: { platform: { slug: PLATFORM }, ...pendingMetadataWhere(new Date()) },
      select: { id: true },
    })
    expect(found.map(g => g.id).sort((a, b) => a - b)).toEqual(
      [never, dueNoMatch, dueNoTime, dueGenre, dueError].map(g => g.id).sort((a, b) => a - b),
    )
    for (const excluded of [waiting, withFicha, matched, matchedBare, unfindable]) {
      expect(found.map(g => g.id)).not.toContain(excluded.id)
    }
  })
})
