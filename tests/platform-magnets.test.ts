import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { GET as platformIndex } from '@/app/api/shop/platform/[slug]/route'
import { isBtihMagnet } from '@/lib/platform-magnets'
import { GET as platformsList } from '@/app/api/shop/platforms/route'

// Entradas solo-magnet de una plataforma que no es Switch: se publican con gh_magnet
// y nunca lo que el admin quito u oculto. Datos sinteticos.
const SLUG = 'test-plat-magnets'
const SOURCE = 'test-plat-magnet-source'
const OK_HASH = '9e2471d4ffbe0efecf4d5ada4f5c6607e57a2244'

let platformId = 0

beforeAll(async () => {
  const platform = await db.platform.upsert({
    where: { slug: SLUG },
    update: { enabled: true },
    create: { slug: SLUG, name: 'Test magnets', scanPath: '/nonexistent', extensions: '.iso', scanMode: 'folder', enabled: true },
  })
  platformId = platform.id
  const row = (sourceKey: string, title: string, titleId: string | null, magnet: string) => ({
    source: SOURCE, sourceKey, title, titleId, titleKey: title.toLowerCase(), magnet,
    sourceUrl: `http://example.test/${sourceKey}`, platformId, syncedAt: new Date(),
  })
  await db.externalGame.createMany({
    data: [
      row('ok', 'PLAT MAGNET OK', null, `magnet:?xt=urn:btih:${OK_HASH}`),
      row('b32', 'PLAT MAGNET BASE32', null, 'magnet:?xt=urn:btih:4XEJ3HH7X7XQ7ZS5VXM6AZ3WMEB7OEOG'),
      row('bl', 'PLAT MAGNET BLACKLIST', null, `magnet:?xt=urn:btih:${'a'.repeat(40)}`),
      row('hid', 'PLAT MAGNET HIDDEN', null, `magnet:?xt=urn:btih:${'b'.repeat(40)}`),
    ],
  })
  await db.torrentBlacklist.create({
    data: { platformId, identity: `topic:${SOURCE}:bl`, source: SOURCE, title: 'PLAT MAGNET BLACKLIST' },
  })
  await db.game.create({
    data: {
      platformId,
      filePath: `torrent://${SLUG}/hid`,
      fileName: 'PLAT MAGNET HIDDEN',
      fileSize: BigInt(0),
      title: 'PLAT MAGNET HIDDEN',
      source: 'torrent',
      externalKey: `torrent:${SOURCE}:topic:${SOURCE}:hid`,
      isHidden: true,
    },
  })
})

afterAll(async () => {
  await db.externalGame.deleteMany({ where: { source: SOURCE } })
  await db.torrentBlacklist.deleteMany({ where: { platformId } })
  await db.game.deleteMany({ where: { platformId } })
  await db.platform.deleteMany({ where: { slug: SLUG } })
})

describe('/api/shop/platform/<slug>: entradas solo-magnet', () => {
  it('publica el magnet valido y omite base32, la lista negra y los ocultos', async () => {
    const res = await platformIndex(
      new Request(`http://127.0.0.1/api/shop/platform/${SLUG}`),
      { params: { slug: SLUG } },
    )
    const body = await res.json()
    const titles = body.files.map((f: { gh_title?: string }) => f.gh_title)
    expect(titles).toContain('PLAT MAGNET OK')
    expect(titles).not.toContain('PLAT MAGNET BASE32')
    expect(titles).not.toContain('PLAT MAGNET BLACKLIST')
    expect(titles).not.toContain('PLAT MAGNET HIDDEN')
    const ok = body.files.find((f: { gh_title?: string }) => f.gh_title === 'PLAT MAGNET OK')
    expect(isBtihMagnet(ok.gh_magnet)).toBe(true)
    expect(ok.url).toBeUndefined()
  })

  it('cuenta los magnets publicables en la lista de plataformas', async () => {
    const res = await platformsList(new Request('http://127.0.0.1/api/shop/platforms'))
    const body = await res.json()
    const entry = body.files.find((f: { slug: string }) => f.slug === SLUG)
    // Solo el magnet valido: base32, lista negra y oculto no cuentan.
    expect(entry.games).toBe(1)
  })
})
