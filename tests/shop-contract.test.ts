import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { GET as shopIndex } from '@/app/api/shop/route'
import { resetShopPasswordCache } from '@/lib/shop-auth'

// Contrato de /api/shop tal como lo consume GameHubNX (#71). Los datos son
// sinteticos: lo que se fija es la forma de la respuesta y la guarda de acceso.
const SLUG = 'test-switch-contract'

beforeAll(async () => {
  const platform = await db.platform.create({
    data: { slug: SLUG, name: 'Switch test', scanPath: '/nonexistent', extensions: '.nsp,.nsz', scanMode: 'folder' },
  })
  await db.game.create({
    data: {
      platformId: platform.id,
      filePath: '/nonexistent/Contract Test [0100ABCDEF123000][v0].nsp',
      fileName: 'Contract Test [0100ABCDEF123000][v0].nsp',
      fileSize: BigInt(1024),
      title: 'Contract Test',
      titleId: '0100ABCDEF123000',
    },
  })
})

afterAll(async () => {
  await db.game.deleteMany({ where: { platform: { slug: SLUG } } })
  await db.platform.deleteMany({ where: { slug: SLUG } })
  await db.setting.deleteMany({ where: { key: 'shop_password' } })
  resetShopPasswordCache()
})

describe('contrato de /api/shop (#71)', () => {
  it('el indice devuelve files, directories y success', async () => {
    const res = await shopIndex(new Request('http://127.0.0.1/api/shop'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.files)).toBe(true)
    expect(Array.isArray(body.directories)).toBe(true)
    expect(String(body.success)).toMatch(/^GameHub · \d+ titles$/)
  })

  it('con contraseña de tienda, sin Basic Auth responde 401 con desafio', async () => {
    await db.setting.upsert({ where: { key: 'shop_password' }, update: { value: 'secreto' }, create: { key: 'shop_password', value: 'secreto' } })
    resetShopPasswordCache()
    const res = await shopIndex(new Request('http://127.0.0.1/api/shop'))
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate') ?? '').toMatch(/^Basic/i)
  })
})
