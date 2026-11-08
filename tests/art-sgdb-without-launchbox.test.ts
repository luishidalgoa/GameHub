import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

// Regresión: el «Rellenar metadatos» de un juego que LaunchBox no encuentra (sin imágenes LaunchBox)
// tiene que rellenar banner y logo desde SteamGridDB, según la cadena de la plataforma.

vi.mock('@/lib/s3', async (orig) => ({
  ...(await orig<typeof import('@/lib/s3')>()),
  uploadToS3: vi.fn().mockResolvedValue(undefined),
  deleteManyFromS3: vi.fn().mockResolvedValue(0),
}))
vi.mock('@/lib/metadata/libretro', () => ({
  fetchLibretroScreens: vi.fn().mockResolvedValue({ snap: null, title: null }),
  fetchLibretroCover: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/metadata/steamgriddb', async (orig) => ({
  ...(await orig<typeof import('@/lib/metadata/steamgriddb')>()),
  fetchSteamGridDBArts: vi.fn(async (_title: string, type: string) =>
    type === 'heroes' ? ['https://cdn.example.test/sgdb-hero.png']
      : type === 'logos' ? ['https://cdn.example.test/sgdb-logo.png']
        : []),
}))
vi.mock('@/lib/game-images', async (orig) => ({
  ...(await orig<typeof import('@/lib/game-images')>()),
  // Sin descargar nada: cada URL queda guardada con una clave fija según su URL.
  storeGameImages: vi.fn(async (_game: unknown, images: { url: string }[]) => ({
    byUrl: new Map(images.map(i => [i.url, { key: `repo/${i.url.split('/').pop()}`, kind: 'x', buffer: null }])),
    failed: 0,
  })),
}))

import { db } from '@/lib/db'
import { storeLaunchBoxArt } from '@/lib/art'
import { DEFAULT_CHAINS } from '@/lib/metadata/chains'

let gameId = 0

beforeAll(async () => {
  const platform = await db.platform.upsert({
    where: { slug: 'test-sgdb-fallback' }, update: {}, create: { slug: 'test-sgdb-fallback', name: 'Test SGDB fallback', sortOrder: 996, scanPath: '/test/sgdb', extensions: '.nsp' },
  })
  const game = await db.game.create({
    data: { filePath: '/test/sgdb/no-launchbox.nsp', fileName: 'no-launchbox.nsp', fileSize: BigInt(1), platformId: platform.id, title: 'Juego sin ficha LaunchBox' },
  })
  gameId = game.id
})

afterAll(async () => {
  await db.game.delete({ where: { id: gameId } })
})

describe('sin imágenes de LaunchBox, el banner y el logo vienen de SteamGridDB', () => {
  const reset = () => db.game.update({ where: { id: gameId }, data: { backdropPath: null, logoPath: null } })

  it('rellena banner y logo aunque la lista de imágenes esté vacía', async () => {
    // Así llega cuando LaunchBox no encontró el juego: found true, ninguna imagen.
    await reset()
    await storeLaunchBoxArt({ id: gameId, platformSlug: 'test-sgdb-fallback', title: 'Juego sin ficha LaunchBox' }, [], { found: true })
    const game = await db.game.findUnique({ where: { id: gameId } })
    expect(game?.backdropPath).toBe('repo/sgdb-hero.png')
    expect(game?.logoPath).toBe('repo/sgdb-logo.png')
  })

  it('sin ficha de ninguna fuente, la cadena igual rellena banner y logo', async () => {
    await reset()
    await storeLaunchBoxArt({ id: gameId, platformSlug: 'test-sgdb-fallback', title: 'Juego sin ficha LaunchBox' }, [], { found: false })
    const game = await db.game.findUnique({ where: { id: gameId } })
    expect(game?.backdropPath).toBe('repo/sgdb-hero.png')
    expect(game?.logoPath).toBe('repo/sgdb-logo.png')
  })

  it('una cadena sin SteamGridDB no la consulta', async () => {
    await reset()
    const chains = { ...DEFAULT_CHAINS, banner: ['launchbox'] as const, logo: ['launchbox'] as const }
    await storeLaunchBoxArt({ id: gameId, platformSlug: 'test-sgdb-fallback', title: 'Juego sin ficha LaunchBox' }, [], { found: false, chains: chains as never })
    const game = await db.game.findUnique({ where: { id: gameId } })
    expect(game?.backdropPath).toBeNull()
    expect(game?.logoPath).toBeNull()
  })
})
