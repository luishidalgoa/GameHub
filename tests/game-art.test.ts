import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import sharp from 'sharp'

vi.mock('@/lib/s3', async (orig) => ({
  ...(await orig<typeof import('@/lib/s3')>()),
  uploadToS3: vi.fn().mockResolvedValue(undefined),
  getFromS3: vi.fn(),
}))

import { db } from '@/lib/db'
import { getFromS3, uploadToS3 } from '@/lib/s3'
import { ArtError, activateImage, addScreenshots, listGameArt, setScreenshots } from '@/lib/game-art'
import { parseLocks } from '@/lib/manual-fields'

let gameId = 0
let png: Buffer

beforeAll(async () => {
  png = await sharp({ create: { width: 64, height: 36, channels: 3, background: '#2a7fa8' } }).png().toBuffer()
  const platform = await db.platform.upsert({
    where: { slug: 'test-art' }, update: {}, create: { slug: 'test-art', name: 'Test art', sortOrder: 998, scanPath: '/test/art', extensions: '.nsp' },
  })
  const game = await db.game.create({
    data: { filePath: '/test/art-game.nsp', fileName: 'art-game.nsp', fileSize: BigInt(1), platformId: platform.id, title: 'Art game' },
  })
  gameId = game.id
})

afterAll(async () => {
  await db.game.delete({ where: { id: gameId } })
})

describe('screenshots the owner manages', () => {
  it('an uploaded image goes to the bucket, into the list, and locks the field', async () => {
    const list = await addScreenshots(gameId, [png])
    expect(list).toHaveLength(1)
    expect(list[0]).toMatch(/^repo\/test-art\/\d+\/manual-screenshot-[0-9a-f]{8}\.webp$/)
    expect(uploadToS3).toHaveBeenCalledOnce()

    const game = await db.game.findUnique({ where: { id: gameId } })
    expect(JSON.parse(game!.screenshotPaths!)).toEqual(list)
    expect(parseLocks(game!.manualFields)).toContain('screenshotPaths')
    expect(await db.gameImage.count({ where: { gameId, kind: 'manual-screenshot' } })).toBe(1)
  })

  it('takes a link in, reorders, removes with an undo window, and puts it back', async () => {
    const [key] = JSON.parse((await db.game.findUnique({ where: { id: gameId } }))!.screenshotPaths!)
    const url = 'https://example.com/shot.jpg'

    expect(await setScreenshots(gameId, [url, key])).toEqual([url, key])

    await setScreenshots(gameId, [url])
    const removed = await db.gameImage.findFirst({ where: { gameId, s3Key: key } })
    expect(removed?.removedAt).not.toBeNull()

    expect(await setScreenshots(gameId, [url, key])).toEqual([url, key])
    expect((await db.gameImage.findFirst({ where: { gameId, s3Key: key } }))?.removedAt).toBeNull()
  })

  it('refuses an entry that is neither a link nor one of this game\'s images', async () => {
    await expect(setScreenshots(gameId, ['repo/other-game/1/evil.webp'])).rejects.toBeInstanceOf(ArtError)
    await expect(setScreenshots(gameId, ['file:///etc/passwd'])).rejects.toBeInstanceOf(ArtError)
  })

  it('an empty list is stored as nothing, not as []', async () => {
    await setScreenshots(gameId, [])
    expect((await db.game.findUnique({ where: { id: gameId } }))?.screenshotPaths).toBeNull()
  })
})

describe('the library and the active image', () => {
  it('shows which library image is the active banner', async () => {
    const row = await db.gameImage.create({
      data: { gameId, kind: 'banner', s3Key: 'repo/test-art/1/banner-aa.webp', sourceUrl: 'https://img.example/b.png', width: 1920, height: 540 },
    })
    await db.game.update({ where: { id: gameId }, data: { backdropPath: `${row.s3Key}?v=1`, backdropKind: 'banner' } })

    const art = await listGameArt(gameId)
    expect(art.backdrop).toMatchObject({ kind: 'banner', imageId: row.id })
    expect(art.images.find(i => i.id === row.id)?.category).toBe('banner')
  })

  it('choosing a library image fills the slot, its palette, and locks the fields', async () => {
    const fanart = await db.gameImage.create({
      data: { gameId, kind: 'fanart', s3Key: 'repo/test-art/1/fanart-bb.webp', sourceUrl: 'https://img.example/f.png' },
    })
    vi.mocked(getFromS3).mockResolvedValue(png)

    await activateImage(gameId, fanart.id)

    const game = await db.game.findUnique({ where: { id: gameId } })
    expect(game?.backdropPath?.split('?')[0]).toBe(fanart.s3Key)
    expect(game?.backdropKind).toBe('fanart')
    expect(game?.tilePath?.split('?')[0]).toBe(fanart.s3Key)
    expect(JSON.parse(game!.themePalette!).length).toBeGreaterThan(0)
    expect(parseLocks(game!.manualFields)).toEqual(expect.arrayContaining(['backdropPath', 'backdropKind', 'tilePath', 'themePalette']))
    expect((await db.gameImage.findUnique({ where: { id: fanart.id } }))?.palette).not.toBeNull()
  })

  it('an image that is not of this game cannot be used', async () => {
    await expect(activateImage(gameId, 999999)).rejects.toBeInstanceOf(ArtError)
  })
})
