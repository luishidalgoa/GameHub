import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { GET as shopIndex } from '@/app/api/shop/route'

// Entradas solo-magnet de /api/shop: solo las que GameHubNX puede instalar, y nunca
// las que el admin quitó u ocultó. Datos sinteticos; la fuente es propia del test.
const SOURCE = 'test-magnet-contract'
const OK_HASH = '9e2471d4ffbe0efecf4d5ada4f5c6607e57a2244'

const row = (sourceKey: string, title: string, titleId: string, magnet: string) => ({
  source: SOURCE, sourceKey, title, titleId, magnet, sourceUrl: `http://example.test/${sourceKey}`,
  syncedAt: new Date(),
})

beforeAll(async () => {
  const platform = await db.platform.upsert({
    where: { slug: 'switch' },
    update: {},
    create: { slug: 'switch', name: 'Switch', scanPath: '/nonexistent', extensions: '.nsp,.nsz', scanMode: 'folder' },
  })
  await db.externalGame.createMany({
    data: [
      { ...row('ok', 'MAGNET OK', '0100AAAA00000001', `magnet:?xt=urn:btih:${OK_HASH}`), platformId: platform.id },
      { ...row('b32', 'MAGNET BASE32', '0100AAAA00000002', 'magnet:?xt=urn:btih:4XEJ3HH7X7XQ7ZS5VXM6AZ3WMEB7OEOG'), platformId: platform.id },
      { ...row('bl', 'MAGNET BLACKLIST', '0100AAAA00000003', `magnet:?xt=urn:btih:${OK_HASH}`), platformId: platform.id },
      { ...row('hid', 'MAGNET HIDDEN', '0100AAAA00000004', `magnet:?xt=urn:btih:${OK_HASH}`), platformId: platform.id },
    ],
  })
  await db.torrentBlacklist.create({
    data: { platformId: platform.id, identity: 'id:0100AAAA00000003', source: SOURCE, title: 'MAGNET BLACKLIST' },
  })
  await db.game.create({
    data: {
      platformId: platform.id,
      filePath: `torrent://switch/id:0100AAAA00000004`,
      fileName: 'MAGNET HIDDEN',
      fileSize: BigInt(0),
      title: 'MAGNET HIDDEN',
      titleId: '0100AAAA00000004',
      source: 'torrent',
      externalKey: `torrent:${SOURCE}:id:0100AAAA00000004`,
      isHidden: true,
    },
  })
})

afterAll(async () => {
  await db.externalGame.deleteMany({ where: { source: SOURCE } })
  await db.torrentBlacklist.deleteMany({ where: { source: SOURCE } })
  await db.game.deleteMany({ where: { externalKey: { startsWith: `torrent:${SOURCE}:` } } })
})

describe('/api/shop: entradas solo-magnet', () => {
  it('publica el magnet válido y omite base32, la lista negra y los ocultos', async () => {
    const res = await shopIndex(new Request('http://127.0.0.1/api/shop'))
    const body = await res.json()
    const titles = body.files.map((f: { gh_title?: string }) => f.gh_title)

    expect(titles).toContain('MAGNET OK')
    expect(titles).not.toContain('MAGNET BASE32')
    expect(titles).not.toContain('MAGNET BLACKLIST')
    expect(titles).not.toContain('MAGNET HIDDEN')
    expect(body.titledb['0100AAAA00000001']).toBeDefined()
    expect(body.titledb['0100AAAA00000003']).toBeUndefined()
    expect(body.titledb['0100AAAA00000004']).toBeUndefined()
  })
})
