import { describe, it, expect } from 'vitest'
import { chooseCover, coverScale, COVER_MIN_SCALE } from '@/lib/metadata/cover-choice'
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
