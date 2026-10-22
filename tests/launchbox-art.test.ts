import { describe, it, expect } from 'vitest'
import { pickBackdrop, pickFanart, pickLogo } from '@/lib/metadata/launchbox-art'
import { extractPalette } from '@/lib/palette'
import type { LaunchBoxImage } from '@/lib/metadata/launchbox'

const img = (type: string, width: number, region?: string): LaunchBoxImage =>
  ({ url: `https://x/${type}-${width}-${region}`, type, width, height: width / 2, region })

describe('pickBackdrop', () => {
  it('follows banner > fanart > square > game title', () => {
    const all = [
      img('Screenshot - Game Title', 640), img('Square', 512),
      img('Fanart - Background', 1920), img('Banner', 1200),
    ]
    expect(pickBackdrop(all)?.kind).toBe('banner')
    expect(pickBackdrop(all.filter(i => i.type !== 'Banner'))?.kind).toBe('fanart')
    expect(pickBackdrop(all.filter(i => !/Banner|Fanart/.test(i.type)))?.kind).toBe('square')
    expect(pickBackdrop(all.filter(i => /Title/.test(i.type)))?.kind).toBe('title')
  })

  it('ignores categories that are not backdrops', () => {
    expect(pickBackdrop([img('Box - Front', 800), img('Screenshot - Gameplay', 1280)])).toBeNull()
  })

  it('prefers the world/europe region, then the largest image', () => {
    const picked = pickBackdrop([
      img('Fanart - Background', 3840, 'Japan'),
      img('Fanart - Background', 1920, 'Europe'),
      img('Fanart - Background', 1280, 'World'),
    ])
    expect(picked?.image.region).toBe('World')
    const sameRegion = pickBackdrop([img('Banner', 1200), img('Banner', 1520)])
    expect(sameRegion?.image.width).toBe(1520)
  })
})

describe('pickFanart', () => {
  it('returns the fanart even when a banner outranks it as backdrop', () => {
    const all = [img('Banner', 1200), img('Fanart - Background', 1920)]
    expect(pickBackdrop(all)?.kind).toBe('banner')
    expect(pickFanart(all)?.width).toBe(1920)
    expect(pickFanart([img('Banner', 1200)])).toBeNull()
  })
})

describe('pickLogo', () => {
  it('returns the clear logo', () => {
    expect(pickLogo([img('Box - Front', 800), img('Clear Logo', 600)])?.type).toBe('Clear Logo')
    expect(pickLogo([img('Box - Front', 800)])).toBeNull()
  })
})

describe('extractPalette', () => {
  const solid = (r: number, g: number, b: number, px: number) =>
    Array.from({ length: px }, () => [r, g, b]).flat()

  it('keeps accent colors over a dominant dark background', () => {
    const rgb = new Uint8Array([
      ...solid(8, 8, 12, 800),          // near black
      ...solid(220, 40, 40, 120),       // red
      ...solid(40, 90, 230, 80),        // blue
    ])
    const palette = extractPalette(rgb, 2)
    expect(palette).toHaveLength(2)
    expect(palette[0]).toMatch(/^#d/)               // red first
    expect(palette[1]).toMatch(/^#2[0-9a-f]5|^#2[0-9a-f]e/i)  // then blue
  })

  it('returns a full palette even for one flat color', () => {
    const rgb = new Uint8Array(solid(120, 120, 120, 100))
    expect(extractPalette(rgb, 3).length).toBeGreaterThanOrEqual(1)
  })
})

describe('wide categories', () => {
  it('skips an upright banner and falls through to the next backdrop', () => {
    const upright = { url: 'https://x/text-page', type: 'Banner', width: 600, height: 900 } as LaunchBoxImage
    const wide = img('Fanart - Background', 1920)
    expect(pickBackdrop([upright, wide])?.kind).toBe('fanart')
    expect(pickBackdrop([upright])).toBeNull()
  })
  it('keeps a landscape banner', () => {
    const wideBanner = { url: 'https://x/b', type: 'Banner', width: 1200, height: 240 } as LaunchBoxImage
    expect(pickBackdrop([wideBanner])?.kind).toBe('banner')
  })
})

describe('small banners', () => {
  it('passes over a banner too small to stretch across a page', () => {
    const tiny = { url: 'https://x/ds', type: 'Banner', width: 400, height: 80 } as LaunchBoxImage
    const big = { url: 'https://x/hd', type: 'Banner', width: 1200, height: 240 } as LaunchBoxImage
    expect(pickBackdrop([tiny])).toBeNull()
    expect(pickBackdrop([tiny, big])?.image.url).toBe('https://x/hd')
  })
})
