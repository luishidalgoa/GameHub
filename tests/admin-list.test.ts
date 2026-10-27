import { describe, it, expect, beforeAll } from 'vitest'
import { db } from '@/lib/db'
import { listAdminGames, dbOrder, LIBRARY_SORT_DEFAULT, GRAVEYARD_SORT_DEFAULT } from '@/lib/games/list'
import { parseGameFilters } from '@/lib/games/filters'
import { artListPage } from '@/lib/art-list'

// Each test uses its own platform, so the rows of other tests never mix in.
const SLUG = 'test-admin-list'

async function seed() {
  const platform = await db.platform.upsert({
    where: { slug: SLUG }, update: {},
    create: { slug: SLUG, name: 'Test admin list', sortOrder: 990, scanPath: '/test/admin-list', extensions: '.nsp' },
  })
  // Titles sort: Alfa, Bravo, Charlie, Delta, Echo. Years: null for Bravo.
  const rows = [
    { title: 'Charlie', releaseYear: 2003, description: 'x', coverPath: 'a.webp' },
    { title: 'Alfa',    releaseYear: 2001, description: null, coverPath: null },
    { title: 'Echo',    releaseYear: null, description: 'x', genre: 'Acción', rawgScore: 80 },
    { title: 'Bravo',   releaseYear: null, description: null, coverPath: null },
    { title: 'Delta',   releaseYear: 2010, description: 'x', coverPath: 'd.webp', genre: 'RPG', developer: 'D', publisher: 'P', rawgScore: 70 },
  ]
  for (const [i, r] of rows.entries()) {
    await db.game.create({ data: {
      filePath: `/test/admin-list/${i}.nsp`, fileName: `${i}.nsp`, fileSize: BigInt(1000 * (i + 1)),
      platformId: platform.id, title: r.title, sortTitle: r.title, releaseYear: r.releaseYear,
      description: r.description ?? null, coverPath: r.coverPath ?? null, genre: (r as { genre?: string }).genre ?? null,
      developer: (r as { developer?: string }).developer ?? null, publisher: (r as { publisher?: string }).publisher ?? null,
      rawgScore: (r as { rawgScore?: number }).rawgScore ?? null,
    } })
  }
  // One hidden game on the same platform, for the graveyard.
  await db.game.create({ data: {
    filePath: '/test/admin-list/hidden.nsp', fileName: 'hidden.nsp', fileSize: BigInt(5), platformId: platform.id,
    title: 'Foxtrot', sortTitle: 'Foxtrot', isHidden: true,
  } })
}

const filters = (q: Record<string, string>) => parseGameFilters({ platform: SLUG, ...q })

describe('the admin game list: one query for the library and the graveyard', () => {
  beforeAll(seed)

  it('pages through every row once, in order, with hasMore telling when to stop', async () => {
    const seen: string[] = []
    let page = 1
    let hasMore = true
    while (hasMore) {
      const r = await listAdminGames({ scope: 'library', filters: filters({}), sort: LIBRARY_SORT_DEFAULT, page, pageSize: 2 })
      seen.push(...r.items.map(i => i.title))
      expect(r.total).toBe(5)
      hasMore = r.hasMore
      page++
    }
    expect(seen).toEqual(['Alfa', 'Bravo', 'Charlie', 'Delta', 'Echo'])
  })

  it('a null year goes last in both directions', async () => {
    const asc = await listAdminGames({ scope: 'library', filters: filters({}), sort: { key: 'year', dir: 'asc' }, page: 1, pageSize: 10 })
    const desc = await listAdminGames({ scope: 'library', filters: filters({}), sort: { key: 'year', dir: 'desc' }, page: 1, pageSize: 10 })
    expect(asc.items.slice(-2).map(i => i.releaseYear)).toEqual([null, null])
    expect(desc.items.slice(-2).map(i => i.releaseYear)).toEqual([null, null])
  })

  it('a completeness sort is computed in memory and agrees with the percentage shown', async () => {
    const r = await listAdminGames({ scope: 'library', filters: filters({}), sort: { key: 'meta', dir: 'desc' }, page: 1, pageSize: 10 })
    const percents = r.items.map(i => i.percent)
    expect(percents).toEqual([...percents].sort((a, b) => b - a))
    expect(r.items[0].title).toBe('Delta')
  })

  it('the missing-field filter keeps only the games that lack every field it names', async () => {
    const r = await listAdminGames({ scope: 'library', filters: filters({ missing: 'cover' }), sort: LIBRARY_SORT_DEFAULT, page: 1, pageSize: 10 })
    expect(r.items.map(i => i.title)).toEqual(['Alfa', 'Bravo', 'Echo'])
    for (const i of r.items) expect(i.missing).toContain('cover')
  })

  it('the library leaves out hidden games, and the graveyard keeps only them', async () => {
    const lib = await listAdminGames({ scope: 'library', filters: filters({}), sort: LIBRARY_SORT_DEFAULT, page: 1, pageSize: 10 })
    expect(lib.items.map(i => i.title)).not.toContain('Foxtrot')
    const grave = await listAdminGames({
      scope: 'graveyard',
      filters: parseGameFilters({ platform: SLUG }),
      sort: GRAVEYARD_SORT_DEFAULT,
      page: 1,
      pageSize: 10,
    })
    expect(grave.items.map(i => i.title)).toEqual(['Foxtrot'])
    expect(grave.items.every(i => i.isHidden)).toBe(true)
  })

  it('the graveyard leaves out a hidden game whose torrent is on the blacklist', async () => {
    const platform = await db.platform.findUniqueOrThrow({ where: { slug: SLUG } })
    await db.game.create({ data: {
      filePath: '/test/admin-list/blocked.nsp', fileName: 'blocked.nsp', fileSize: BigInt(5), platformId: platform.id,
      title: 'Golf', sortTitle: 'Golf', isHidden: true, source: 'torrent', externalKey: 'torrent:test-src:id:BLOCKED1',
    } })
    await db.torrentBlacklist.create({
      data: { platformId: platform.id, identity: 'id:BLOCKED1', source: 'test-src', title: 'Golf' },
    })
    const grave = await listAdminGames({
      scope: 'graveyard',
      filters: parseGameFilters({ platform: SLUG }),
      sort: GRAVEYARD_SORT_DEFAULT,
      page: 1,
      pageSize: 10,
    })
    expect(grave.items.map(i => i.title)).toEqual(['Foxtrot'])
  })

  it('the database order puts nullable columns last', () => {
    expect(dbOrder('year', 'asc')[0]).toEqual({ releaseYear: { sort: 'asc', nulls: 'last' } })
    expect(dbOrder('region', 'desc')[0]).toEqual({ region: { sort: 'desc', nulls: 'last' } })
  })

  it('the art list pages through every missing-art entry once', async () => {
    // Five visible games on the test platform, none with a backdrop or a logo: two entries each.
    const filter = { vista: 'todos' as const, falta: 'ambos' as const, plataforma: 'Test admin list' }
    const seen: string[] = []
    let page = 1
    let hasMore = true
    while (hasMore) {
      const r = await artListPage(filter, page, 2)
      seen.push(...r.items.map(i => `${i.id}:${i.missing}`))
      expect(r.total).toBeGreaterThanOrEqual(10)
      hasMore = r.hasMore
      page++
    }
    expect(new Set(seen).size).toBe(seen.length)
    expect(seen.length).toBeGreaterThanOrEqual(10)
  })
})
