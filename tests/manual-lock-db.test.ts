import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { runAutomatic } from '@/lib/automatic'

describe('the database layer honours the owner locks', () => {
  it('automatic writes skip a locked field; the owner can still change it', async () => {
    const platform = await db.platform.upsert({
      where: { slug: 'test-lock' }, update: {}, create: { slug: 'test-lock', name: 'Test lock', sortOrder: 999, scanPath: '/test/lock', extensions: '.nsp' },
    })
    const game = await db.game.create({
      data: {
        filePath: '/test/lock-game.nsp', fileName: 'lock-game.nsp', fileSize: BigInt(1),
        platformId: platform.id, title: 'Lock game', developer: 'Owner dev', manualFields: '["developer"]',
      },
    })
    await runAutomatic(() => db.game.update({ where: { id: game.id }, data: { developer: 'Auto dev', releaseYear: 2001 } }))
    const afterAuto = await db.game.findUnique({ where: { id: game.id } })
    expect(afterAuto?.developer).toBe('Owner dev')
    expect(afterAuto?.releaseYear).toBe(2001)

    await db.game.update({ where: { id: game.id }, data: { developer: 'Owner changed' } })
    expect((await db.game.findUnique({ where: { id: game.id } }))?.developer).toBe('Owner changed')

    await db.game.delete({ where: { id: game.id } })
  })
})
