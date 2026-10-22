import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { pendingWhere } from '@/lib/library'

describe('pending lists keep games that were never searched', () => {
  it('a game with no art status and no metadata status is pending, not dropped', async () => {
    const platform = await db.platform.upsert({
      where: { slug: 'test-null' }, update: {},
      create: { slug: 'test-null', name: 'Test null', sortOrder: 997, scanPath: '/test/null', extensions: '.nsp' },
    })
    const fresh = await db.game.create({
      data: { filePath: '/test/null/fresh.nsp', fileName: 'fresh.nsp', fileSize: BigInt(1), platformId: platform.id, title: 'Fresh', developer: null },
    })
    const rows = await db.game.findMany({ where: pendingWhere({ developer: null }) as never, select: { id: true } })
    expect(rows.map(r => r.id)).toContain(fresh.id)
    await db.game.delete({ where: { id: fresh.id } })
  })
})
