import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { applyMetadata } from '@/lib/metadata/apply'

async function gameWith(slug: string, data: Record<string, unknown>) {
  const platform = await db.platform.upsert({
    where: { slug: 'test-apply' }, update: {},
    create: { slug: 'test-apply', name: 'Test apply', sortOrder: 980, scanPath: '/test/apply', extensions: '.nsp' },
  })
  return db.game.create({ data: { filePath: `/test/apply/${slug}.nsp`, fileName: `${slug}.nsp`, fileSize: BigInt(1), platformId: platform.id, title: slug, ...data } })
}

describe('applyMetadata: one place for the lock and provenance rules (#85)', () => {
  it('an owner value locks the field; a blank one releases it', async () => {
    const g = await gameWith('owner-a', { developer: 'Old' })
    await applyMetadata(g.id, { origin: 'owner', data: { developer: 'Mine', genre: '' } })
    const after = await db.game.findUnique({ where: { id: g.id } })
    expect(after?.developer).toBe('Mine')
    expect(JSON.parse(after!.manualFields!)).toEqual(['developer'])
  })

  it('an automatic fill leaves the owner-locked field alone and fills the rest', async () => {
    const g = await gameWith('auto-a', {})
    await applyMetadata(g.id, { origin: 'owner', data: { developer: 'Mine' } })
    await applyMetadata(g.id, { origin: 'auto', data: { developer: 'Provider', releaseYear: 2001 } })
    const after = await db.game.findUnique({ where: { id: g.id } })
    expect(after?.developer).toBe('Mine')
    expect(after?.releaseYear).toBe(2001)
  })

  it('a pick writes the provider value and locks nothing', async () => {
    const g = await gameWith('pick-a', {})
    await applyMetadata(g.id, { origin: 'pick', data: { developer: 'Picked' } })
    const after = await db.game.findUnique({ where: { id: g.id } })
    expect(after?.developer).toBe('Picked')
    expect(after?.manualFields).toBeNull()
  })

  it('a pick releases the owner lock on the fields it writes', async () => {
    const g = await gameWith('pick-b', {})
    await applyMetadata(g.id, { origin: 'owner', data: { developer: 'Mine', genre: 'Own' } })
    await applyMetadata(g.id, { origin: 'pick', data: { developer: 'Picked' } })
    const after = await db.game.findUnique({ where: { id: g.id } })
    expect(after?.developer).toBe('Picked')
    expect(JSON.parse(after!.manualFields!)).toEqual(['genre'])
  })

  it('the provenance a write leaves replaces the old one, and keeps a hand-picked cover', async () => {
    const g = await gameWith('prov-a', { metadataSources: JSON.stringify({ cover: 'steamgriddb', coverManual: true, info: 'rawg' }) })
    await applyMetadata(g.id, { origin: 'auto', data: { genre: 'Action' }, sources: { info: 'launchbox' } })
    const after = await db.game.findUnique({ where: { id: g.id } })
    expect(JSON.parse(after!.metadataSources!)).toEqual({ info: 'launchbox', cover: 'steamgriddb', coverManual: true })
  })
})
