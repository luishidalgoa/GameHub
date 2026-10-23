import { describe, it, expect } from 'vitest'
import { db, rawDb } from '@/lib/db'
import { companyId } from '@/lib/catalog'
import { mergeCompanies, setOwner } from '@/lib/catalog-merge'

describe('company owners (#143)', () => {
  it('a sub-company points at its owner, and clearing it takes it out again', async () => {
    const owner = await companyId(rawDb, 'Grupo Owner Uno')
    const sub = await companyId(rawDb, 'Sello Sub Uno')
    await setOwner(rawDb, [sub!], owner)
    expect((await db.company.findUnique({ where: { id: sub! } }))?.parentId).toBe(owner)
    await setOwner(rawDb, [sub!], null)
    expect((await db.company.findUnique({ where: { id: sub! } }))?.parentId).toBeNull()
  })

  it('refuses a company that belongs to itself, and a loop of owners', async () => {
    const a = await companyId(rawDb, 'Loop Alfa Owner')
    const b = await companyId(rawDb, 'Loop Beta Owner')
    await setOwner(rawDb, [b!], a)
    await expect(setOwner(rawDb, [a!], a)).rejects.toThrow('belong to itself')
    // a is above b: making a belong to b would close the loop.
    await expect(setOwner(rawDb, [a!], b)).rejects.toThrow('loop')
  })

  it('merging several companies moves the games and the sub-companies of all of them', async () => {
    const platform = await db.platform.upsert({
      where: { slug: 'test-owner' }, update: {},
      create: { slug: 'test-owner', name: 'Test owner', sortOrder: 978, scanPath: '/test/owner', extensions: '.nsp' },
    })
    const kept = await companyId(rawDb, 'Kept Estudio Owner')
    const dupA = await companyId(rawDb, 'Dup Uno Estudio Owner')
    const dupB = await companyId(rawDb, 'Dup Dos Estudio Owner')
    const child = await companyId(rawDb, 'Hija Del Dup Owner')
    await setOwner(rawDb, [child!], dupA)
    const game = await db.game.create({
      data: { filePath: '/test/owner/a.nsp', fileName: 'a.nsp', fileSize: BigInt(1), platformId: platform.id, title: 'O', publisherCompanyId: dupB },
    })

    await mergeCompanies(rawDb, [dupA!, dupB!], kept!)

    expect((await db.game.findUnique({ where: { id: game.id } }))?.publisherCompanyId).toBe(kept)
    expect((await db.company.findUnique({ where: { id: child! } }))?.parentId).toBe(kept)
    expect(await db.company.findUnique({ where: { id: dupA! } })).toBeNull()
    expect(await companyId(rawDb, 'Dup Dos Estudio Owner')).toBe(kept)
  })
})
