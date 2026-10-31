import { describe, it, expect } from 'vitest'
import { chooseCover, coverScale, coverKey, isBetterCover, keepsCurrentCover, COVER_MIN_SCALE } from '@/lib/metadata/cover-choice'
import { optionsFor } from '@/lib/metadata/chains'

// The image of each candidate: its size, so the test decides the quality without a download.
const sized = (sizes: Record<string, [number, number]>) => async (url: string) => {
  const size = sizes[url]
  return size ? { buffer: Buffer.from(url), width: size[0], height: size[1] } : null
}
const from = (urls: Record<string, string | null>) =>
  Object.fromEntries(Object.entries(urls).map(([k, v]) => [k, async () => v])) as never
const BOX = { width: 200, height: 300 }   // the card; a good cover is 2× this: 400×600

describe('a cover is good when it is COVER_MIN_SCALE times the box', () => {
  it('scale 1 is the minimum good size', () => {
    expect(COVER_MIN_SCALE).toBe(2)
    expect(coverScale(400, 600, BOX)).toBe(1)
    expect(coverScale(300, 600, BOX)).toBeLessThan(1)
  })
})

describe('the cover chain', () => {
  it('takes the first source whose cover is good enough, even after a smaller one', async () => {
    const cover = await chooseCover({
      chain: ['libretro', 'launchbox'],
      urls: from({ libretro: 'https://retro/small.png', launchbox: 'https://lb/box.jpg' }),
      box: BOX,
      probe: sized({ 'https://retro/small.png': [200, 300], 'https://lb/box.jpg': [600, 900] }),
    })
    expect(cover?.source).toBe('launchbox')
    expect(cover?.coverUrl).toBe('https://lb/box.jpg')
  })

  it('keeps the first good one when the primary is already good', async () => {
    const cover = await chooseCover({
      chain: ['launchbox', 'steamgriddb'],
      urls: from({ launchbox: 'https://lb/box.jpg', steamgriddb: 'https://sgdb/grid.png' }),
      box: BOX,
      probe: sized({ 'https://lb/box.jpg': [600, 900], 'https://sgdb/grid.png': [600, 900] }),
    })
    expect(cover?.source).toBe('launchbox')
  })

  it('when no source is good, the largest small cover is kept', async () => {
    const cover = await chooseCover({
      chain: ['launchbox', 'steamgriddb'],
      urls: from({ launchbox: 'https://lb/small.jpg', steamgriddb: 'https://sgdb/tiny.png' }),
      box: BOX,
      probe: sized({ 'https://lb/small.jpg': [300, 450], 'https://sgdb/tiny.png': [100, 150] }),
    })
    expect(cover?.source).toBe('launchbox')
    expect(cover?.scale).toBeLessThan(1)
  })

  it('skips a source that gives no URL or whose image cannot be read', async () => {
    const cover = await chooseCover({
      chain: ['launchbox', 'steamgriddb', 'libretro'],
      urls: from({ launchbox: null, steamgriddb: 'https://sgdb/broken', libretro: 'https://retro/box.png' }),
      box: BOX,
      probe: sized({ 'https://retro/box.png': [800, 1200] }),
    })
    expect(cover?.source).toBe('libretro')
  })

  it('an empty chain means no cover', async () => {
    expect(await chooseCover({ chain: [], urls: {}, box: BOX })).toBeNull()
  })

  it('RAWG is never a cover source: its image is a screenshot', () => {
    expect(optionsFor('cover', 'xbox-360')).not.toContain('rawg')
  })

  it('Nintendo covers are an option for Switch only', () => {
    expect(optionsFor('cover', 'switch')).toContain('nintendo')
    expect(optionsFor('cover', 'xbox-360')).not.toContain('nintendo')
  })
})

describe('the best cover for the platform', () => {
  const SATURN = { width: 200, height: 300, altWidth: 200, altHeight: 200 }

  it('a box beats art, whatever the size of the art', async () => {
    const cover = await chooseCover({
      chain: ['launchbox', 'libretro'],
      urls: from({ launchbox: 'https://lb/banner.jpg', libretro: 'https://retro/box.png' }),
      box: BOX,
      probe: sized({ 'https://lb/banner.jpg': [1920, 1080], 'https://retro/box.png': [200, 300] }),
    })
    expect(cover?.source).toBe('libretro')
  })

  it('a big secondary-box cover beats a small main-box one', async () => {
    const cover = await chooseCover({
      chain: ['libretro', 'launchbox'],
      urls: from({ libretro: 'https://retro/box.png', launchbox: 'https://lb/square.png' }),
      box: SATURN,
      probe: sized({ 'https://retro/box.png': [200, 300], 'https://lb/square.png': [512, 512] }),
    })
    expect(cover?.source).toBe('launchbox')
  })

  it('a main-box cover big enough is kept without asking the later sources', async () => {
    const probed: string[] = []
    const cover = await chooseCover({
      chain: ['launchbox', 'steamgriddb'],
      urls: from({ launchbox: 'https://lb/box.jpg', steamgriddb: 'https://sgdb/grid.png' }),
      box: BOX,
      probe: async (url) => {
        probed.push(url)
        return sized({ 'https://lb/box.jpg': [600, 900], 'https://sgdb/grid.png': [600, 900] })(url)
      },
    })
    expect(cover?.source).toBe('launchbox')
    expect(probed).toEqual(['https://lb/box.jpg'])
  })

  it('a cover key ranks box, then size, then how small', () => {
    expect(coverKey(600, 900, BOX)[0]).toBe(1)
    expect(coverKey(1920, 1080, BOX)[0]).toBe(0)
    expect(coverKey(600, 900, BOX)[1]).toBe(1)
    expect(coverKey(300, 450, BOX)[1]).toBe(0)
  })

  it('a secondary box big enough ranks the same as a main box big enough', () => {
    expect(coverKey(512, 512, SATURN)).toEqual(coverKey(600, 900, SATURN))
  })

  it('a secondary-box cover big enough beats a main-box one from a later source', async () => {
    const cover = await chooseCover({
      chain: ['libretro', 'launchbox'],
      urls: from({ libretro: 'https://retro/square.png', launchbox: 'https://lb/box.jpg' }),
      box: SATURN,
      probe: sized({ 'https://retro/square.png': [512, 512], 'https://lb/box.jpg': [600, 900] }),
    })
    expect(cover?.source).toBe('libretro')
  })
})

describe('a pass keeps the cover the game has when it is as good', () => {
  const BOXES = { width: 200, height: 300 }

  it('a worse new cover does not replace a good one', () => {
    expect(keepsCurrentCover({ width: 600, height: 900 }, { width: 300, height: 450 }, BOXES)).toBe(true)
  })

  it('a better new cover replaces the current one', () => {
    expect(keepsCurrentCover({ width: 300, height: 450 }, { width: 600, height: 900 }, BOXES)).toBe(false)
  })

  it('a box replaces a banner, which is art', () => {
    expect(keepsCurrentCover({ width: 1920, height: 1080 }, { width: 200, height: 300 }, BOXES)).toBe(false)
  })

  it('a good secondary-box cover is kept against a good main-box one', () => {
    const SATURN = { width: 200, height: 300, altWidth: 200, altHeight: 200 }
    expect(keepsCurrentCover({ width: 512, height: 512 }, { width: 600, height: 900 }, SATURN)).toBe(true)
  })

  it('an equally good cover does not churn: the current one stays', () => {
    expect(keepsCurrentCover({ width: 600, height: 900 }, { width: 600, height: 900 }, BOXES)).toBe(true)
  })

  it('a cover whose size is not measured cannot be compared: the new one wins', () => {
    expect(keepsCurrentCover({ width: null, height: null }, { width: 600, height: 900 }, BOXES)).toBe(false)
    expect(keepsCurrentCover({ width: 600, height: 900 }, { width: undefined, height: undefined }, BOXES)).toBe(false)
  })
})

describe('among covers big enough, the shape closest to the box wins', () => {
  const SHAPE_BOX = { width: 300, height: 492 }   // a 0.61 box: both covers below are big enough
  it('a 670x1100 box beats a 600x900 cover of the same box shape', () => {
    expect(isBetterCover(coverKey(670, 1100, SHAPE_BOX), coverKey(600, 900, SHAPE_BOX))).toBe(true)
  })
  it('a big 600x900 cover is not kept when a 670x1100 box comes', () => {
    expect(keepsCurrentCover({ width: 600, height: 900 }, { width: 670, height: 1100 }, SHAPE_BOX)).toBe(false)
  })
})
