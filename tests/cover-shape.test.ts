import { describe, it, expect, vi } from 'vitest'
import sharp from 'sharp'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/s3', () => ({ uploadCoverToS3: vi.fn() }))

import { isBoxRatio, noBoxWhere, BOX_MAX_RATIO } from '@/lib/cover-shape'
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

describe('box shape', () => {
  it('a 2:3 box is a box', () => {
    expect(isBoxRatio(2 / 3)).toBe(true)
  })

  it('a nearly square box is still a box', () => {
    expect(isBoxRatio(1.11)).toBe(true)
  })

  it('a banner or a fanart is not a box', () => {
    expect(isBoxRatio(16 / 9)).toBe(false)
    expect(isBoxRatio(1.5)).toBe(false)
  })

  it('an unmeasured cover is not counted as a box', () => {
    expect(isBoxRatio(null)).toBe(false)
  })

  it('the no-box filter catches games with no cover, no ratio or art-shaped covers', () => {
    const where = noBoxWhere() as { OR: Array<Record<string, unknown>> }
    expect(where.OR).toContainEqual({ coverPath: null })
    expect(where.OR).toContainEqual({ coverRatio: null })
    expect(where.OR).toContainEqual({ coverRatio: { gt: BOX_MAX_RATIO } })
  })
})

describe('processing a cover', () => {
  it('keeps the proportion of a landscape image instead of padding it', async () => {
    const { webp, ratio } = await processCover(await solid(1600, 900))
    const meta = await sharp(webp).metadata()
    expect(ratio).toBeCloseTo(16 / 9, 2)
    expect(meta.width! / meta.height!).toBeCloseTo(16 / 9, 2)
  })

  it('reports a 2:3 box as a box', async () => {
    const { ratio } = await processCover(await solid(600, 900))
    expect(isBoxRatio(ratio)).toBe(true)
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
