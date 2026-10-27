import { describe, it, expect, vi } from 'vitest'
import sharp from 'sharp'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/s3', () => ({ uploadCoverToS3: vi.fn() }))

import { isBoxRatio, boxRatioOf, noBoxForPlatform, noBoxWhereByPlatform, DEFAULT_BOX_RATIO } from '@/lib/cover-shape'
import { processCover, trimTransparent } from '@/lib/covers'

// A solid colour image of the given size, as a PNG buffer.
const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } }).png().toBuffer()

// A canvas of the given size with a solid block centred in it and transparent padding around.
const padded = (canvasW: number, canvasH: number, artW: number, artH: number) =>
  sharp({ create: { width: artW, height: artH, channels: 4, background: { r: 30, g: 120, b: 200, alpha: 1 } } })
    .png().toBuffer()
    .then(art => sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: art, left: Math.round((canvasW - artW) / 2), top: Math.round((canvasH - artH) / 2) }])
      .png().toBuffer())

describe('each platform judges its own box', () => {
  const threeDS = boxRatioOf(350, 300)     // 1.17
  const snes = boxRatioOf(200, 140)        // 1.43
  const standard = boxRatioOf(200, 300)    // 0.67

  it('a 3DS box (about 1.1) is a box on 3DS', () => {
    expect(isBoxRatio(1.11, threeDS)).toBe(true)
  })

  it('a 3DS box is not judged against a 2:3 platform', () => {
    expect(isBoxRatio(1.11, standard)).toBe(false)
  })

  it('a landscape SNES box is a box on SNES', () => {
    expect(isBoxRatio(1.43, snes)).toBe(true)
  })

  it('a 16:9 banner is art on every platform', () => {
    expect(isBoxRatio(16 / 9, threeDS)).toBe(false)
    expect(isBoxRatio(16 / 9, snes)).toBe(false)
    expect(isBoxRatio(16 / 9, standard)).toBe(false)
  })

  it('a square on a 2:3 platform is art', () => {
    expect(isBoxRatio(1, standard)).toBe(false)
  })

  it('an unmeasured cover is not counted as a box', () => {
    expect(isBoxRatio(null, standard)).toBe(false)
  })

  it('falls back to 2:3 when a platform has no usable size', () => {
    expect(boxRatioOf(null, null)).toBe(DEFAULT_BOX_RATIO)
    expect(boxRatioOf(0, 300)).toBe(DEFAULT_BOX_RATIO)
  })
})

describe('the no-box filter', () => {
  it('for one platform catches games with no cover, no ratio, or a ratio outside its box', () => {
    const where = noBoxForPlatform(boxRatioOf(350, 300)) as { OR: Array<Record<string, unknown>> }
    expect(where.OR).toContainEqual({ coverPath: null })
    expect(where.OR).toContainEqual({ coverRatio: null })
    expect(where.OR.some(c => c.coverRatio != null && typeof c.coverRatio === 'object' && 'lt' in (c.coverRatio as object))).toBe(true)
    expect(where.OR.some(c => c.coverRatio != null && typeof c.coverRatio === 'object' && 'gt' in (c.coverRatio as object))).toBe(true)
  })

  it('across platforms, each platform uses its own bounds', () => {
    const where = noBoxWhereByPlatform([
      { platformId: 1, boxRatio: 0.67 },
      { platformId: 2, boxRatio: 1.17 },
    ]) as { OR: Array<{ AND: Array<Record<string, unknown>> }> }
    expect(where.OR).toHaveLength(2)
    expect(where.OR[1].AND[0]).toEqual({ platformId: 2 })
  })
})

describe('processing a cover', () => {
  it('keeps the proportion of a landscape image instead of padding it', async () => {
    const { webp, ratio } = await processCover(await solid(1600, 900))
    const meta = await sharp(webp).metadata()
    expect(ratio).toBeCloseTo(16 / 9, 2)
    expect(meta.width! / meta.height!).toBeCloseTo(16 / 9, 2)
  })
})

describe('trimming transparent padding', () => {
  it('gives back the art from a padded canvas', async () => {
    const trimmed = await trimTransparent(await padded(800, 1200, 800, 450))
    const meta = await sharp(trimmed).metadata()
    expect(meta.width).toBe(800)
    expect(meta.height).toBe(450)
  })

  it('leaves an image without padding alone', async () => {
    const input = await solid(300, 200)
    const out = await trimTransparent(input)
    expect(out).toBe(input)
  })
})
