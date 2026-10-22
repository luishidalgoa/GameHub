import { describe, it, expect } from 'vitest'
import { db, rawDb } from '@/lib/db'
import { companyId } from '@/lib/catalog'
import { mergeCompanies } from '@/lib/catalog-merge'

describe('merging two companies (#143)', () => {
  it('moves the games to the kept company, and a name of the duplicate resolves to it', async () => {
    const platform = await db.platform.upsert({
      where: { slug: 'test-merge' }, update: {},
      create: { slug: 'test-merge', name: 'Test merge', sortOrder: 979, scanPath: '/test/merge', extensions: '.nsp' },
    })
    const dup = await companyId(rawDb, 'Estudio Alfa Merge')
    const kept = await companyId(rawDb, 'Estudio Beta Merge')
    expect(dup).not.toBeNull()
    expect(kept).not.toBeNull()
    const game = await db.game.create({
      data: { filePath: '/test/merge/a.nsp', fileName: 'a.nsp', fileSize: BigInt(1), platformId: platform.id, title: 'M', publisherCompanyId: dup },
    })

    const result = await mergeCompanies(rawDb, dup!, kept!)

    expect(result.games).toBeGreaterThanOrEqual(1)
    expect((await db.game.findUnique({ where: { id: game.id } }))?.publisherCompanyId).toBe(kept)
    expect(await db.company.findUnique({ where: { id: dup! } })).toBeNull()
    // The name the duplicate was known by now finds the kept company, not a new row.
    expect(await companyId(rawDb, 'Estudio Alfa Merge')).toBe(kept)
  })

  it('refuses to merge a company into itself', async () => {
    const id = await companyId(rawDb, 'Estudio Gamma Merge')
    await expect(mergeCompanies(rawDb, id!, id!)).rejects.toThrow('same company')
  })
})
