import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

vi.mock('@/lib/s3', async (orig) => ({
  ...(await orig<typeof import('@/lib/s3')>()),
  uploadToS3: vi.fn().mockResolvedValue(undefined),
  deleteManyFromS3: vi.fn().mockResolvedValue(0),
}))
vi.mock('@/lib/metadata/libretro', () => ({
  fetchLibretroScreens: vi.fn().mockResolvedValue({ snap: null, title: null }),
  fetchLibretroCover: vi.fn().mockResolvedValue(null),
}))

import { db } from '@/lib/db'
import { storeLaunchBoxArt } from '@/lib/art'
import { purgeExpiredManualArt, REMOVAL_WINDOW_MS } from '@/lib/art-manual'
import type { LaunchBoxImage } from '@/lib/metadata/launchbox'

let gameId = 0
const banner: LaunchBoxImage = { url: 'https://images.launchbox-app.com/removed-banner.png', type: 'Banner', width: 1200, height: 675 }

beforeAll(async () => {
  const platform = await db.platform.upsert({
    where: { slug: 'test-removed' }, update: {}, create: { slug: 'test-removed', name: 'Test removed', sortOrder: 997, scanPath: '/test/removed', extensions: '.nsp' },
  })
  const game = await db.game.create({
    data: { filePath: '/test/removed-game.nsp', fileName: 'removed-game.nsp', fileSize: BigInt(1), platformId: platform.id, title: 'Removed game' },
  })
  gameId = game.id
  await db.gameImage.create({
    data: { gameId, kind: 'banner', s3Key: 'repo/test-removed/1/banner-removed.webp', sourceUrl: banner.url, removedAt: new Date() },
  })
})

afterAll(async () => {
  await db.game.delete({ where: { id: gameId } })
})

describe('an image the owner removed stays removed', () => {
  it('a later fill does not pick it as the banner, nor store it again', async () => {
    await storeLaunchBoxArt({ id: gameId, platformSlug: 'test-removed' }, [banner], { found: true })
    const game = await db.game.findUnique({ where: { id: gameId } })
    expect(game?.backdropPath).toBeNull()
    expect(await db.gameImage.count({ where: { gameId, sourceUrl: banner.url } })).toBe(1)
  })

  it('the purge deletes only the owner\'s own images, never a removed LaunchBox row', async () => {
    const long = new Date(Date.now() - REMOVAL_WINDOW_MS - 60_000)
    await db.gameImage.updateMany({ where: { gameId, sourceUrl: banner.url }, data: { removedAt: long } })
    await purgeExpiredManualArt()
    expect(await db.gameImage.count({ where: { gameId, sourceUrl: banner.url } })).toBe(1)
  })
})
