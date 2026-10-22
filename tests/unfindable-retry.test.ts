import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { requeueUnfindable, noMatchRetryAt, NO_MATCH_RETRY_DAYS } from '@/lib/metadata/retry'

describe('unfindable games are requeued on demand', () => {
  it('a no-match waits the configured days before its next automatic try', () => {
    const now = Date.UTC(2026, 9, 1)
    expect(noMatchRetryAt(now).getTime() - now).toBe(NO_MATCH_RETRY_DAYS * 24 * 3600_000)
  })
  it('requeues only unfindable games, clearing their status and retry date', async () => {
    const platform = await db.platform.upsert({
      where: { slug: 'test-retry' }, update: {},
      create: { slug: 'test-retry', name: 'Test retry', sortOrder: 998, scanPath: '/test/retry', extensions: '.nsp' },
    })
    const base = { fileSize: BigInt(1), platformId: platform.id, fileName: 'r.nsp' }
    const lost = await db.game.create({ data: { ...base, filePath: '/test/retry/lost.nsp', title: 'Lost', artStatus: 'no-match', metadataStatus: 'no_match', metadataNextRetryAt: noMatchRetryAt() } })
    const found = await db.game.create({ data: { ...base, filePath: '/test/retry/found.nsp', title: 'Found', artStatus: 'ok', metadataStatus: 'matched' } })

    const n = await requeueUnfindable([lost.id, found.id])
    expect(n).toBe(1)
    const after = await db.game.findUnique({ where: { id: lost.id } })
    expect(after?.metadataStatus).toBeNull()
    expect(after?.metadataNextRetryAt).toBeNull()
    expect(after?.artStatus).toBeNull()
    expect((await db.game.findUnique({ where: { id: found.id } }))?.artStatus).toBe('ok')

    await db.game.deleteMany({ where: { id: { in: [lost.id, found.id] } } })
  })
})
