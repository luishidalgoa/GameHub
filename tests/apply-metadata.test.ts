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
const prov = (g: { metadataSources: string | null }) => JSON.parse(g.metadataSources ?? '{}')

describe('applyMetadata: one place for the lock and provenance rules (#85)', () => {
  it('an owner value locks the field and carries the owner as its source; a blank one releases it', async () => {
    const g = await gameWith('owner-a', { developer: 'Old', metadataSources: JSON.stringify({ facts: { developer: 'launchbox' } }) })
    await applyMetadata(g.id, { origin: 'owner', data: { developer: 'Mine', genre: '' } })
    const after = await db.game.findUnique({ where: { id: g.id } })
    expect(after?.developer).toBe('Mine')
    expect(JSON.parse(after!.manualFields!)).toEqual(['developer'])
    expect(prov(after!).facts?.developer).toBeUndefined()
  })

  it('an automatic fill leaves the owner-locked field alone and fills the rest with its source', async () => {
    const g = await gameWith('auto-a', {})
    await applyMetadata(g.id, { origin: 'owner', data: { developer: 'Mine' } })
    await applyMetadata(g.id, { origin: 'auto', patch: {
      developer:   { value: 'Provider', source: 'launchbox' },
      releaseYear: { value: 2001, source: 'launchbox' },
    } })
    const after = await db.game.findUnique({ where: { id: g.id } })
    expect(after?.developer).toBe('Mine')
    expect(after?.releaseYear).toBe(2001)
    expect(prov(after!).facts).toEqual({ releaseYear: 'launchbox' })
  })

  it('a pick writes the provider value, labels it, and locks nothing', async () => {
    const g = await gameWith('pick-a', {})
    await applyMetadata(g.id, { origin: 'pick', patch: { developer: { value: 'Picked', source: 'rawg' } } })
    const after = await db.game.findUnique({ where: { id: g.id } })
    expect(after?.developer).toBe('Picked')
    expect(after?.manualFields).toBeNull()
    expect(prov(after!).facts).toEqual({ developer: 'rawg' })
  })

  it('a pick releases the owner lock on the fields it writes', async () => {
    const g = await gameWith('pick-b', {})
    await applyMetadata(g.id, { origin: 'owner', data: { developer: 'Mine', genre: 'Own' } })
    await applyMetadata(g.id, { origin: 'pick', patch: { developer: { value: 'Picked', source: 'rawg' } } })
    const after = await db.game.findUnique({ where: { id: g.id } })
    expect(after?.developer).toBe('Picked')
    expect(JSON.parse(after!.manualFields!)).toEqual(['genre'])
  })

  it('a patch carries its label: the labels it does not touch survive, a blank value loses its own', async () => {
    const g = await gameWith('prov-a', { metadataSources: JSON.stringify({
      cover: 'steamgriddb', coverManual: true, info: 'rawg', facts: { genre: 'rawg', developer: 'launchbox' },
    }) })
    await applyMetadata(g.id, { origin: 'auto', patch: {
      developer: { value: null, source: 'launchbox' },
      publisher: { value: 'Pub', source: 'launchbox' },
    } })
    const after = await db.game.findUnique({ where: { id: g.id } })
    expect(prov(after!)).toEqual({ cover: 'steamgriddb', coverManual: true, info: 'rawg', facts: { genre: 'rawg', publisher: 'launchbox' } })
  })

  it('a write that sets no cover keeps a hand-picked one', async () => {
    const g = await gameWith('cover-a', { metadataSources: JSON.stringify({ cover: 'steamgriddb', coverManual: true }) })
    await applyMetadata(g.id, { origin: 'auto', patch: { genre: { value: 'Action', source: 'rawg' } } })
    const after = await db.game.findUnique({ where: { id: g.id } })
    expect(prov(after!)).toMatchObject({ cover: 'steamgriddb', coverManual: true, facts: { genre: 'rawg' } })
  })
})
