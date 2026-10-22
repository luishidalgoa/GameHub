import { describe, it, expect } from 'vitest'
import { tileImageKey } from '@/lib/tile-art'

describe('tileImageKey: banner, fanart, square, title, then box art', () => {
  it('prefers a banner over the fanart', () => {
    expect(tileImageKey('repo/a/1/fanart.webp', 'repo/a/1/banner.webp', 'banner')).toBe('repo/a/1/banner.webp')
  })
  it('uses the fanart when the best backdrop is the fanart', () => {
    expect(tileImageKey('repo/a/1/fanart.webp', 'repo/a/1/fanart.webp', 'fanart')).toBe('repo/a/1/fanart.webp')
  })
  it('uses a square, then a title screen, when that is the best backdrop', () => {
    expect(tileImageKey(null, 'repo/a/1/sq.webp', 'square')).toBe('repo/a/1/sq.webp')
    expect(tileImageKey(null, 'repo/a/1/title.webp', 'title')).toBe('repo/a/1/title.webp')
  })
  it('returns null (box art) when there is no LaunchBox art, and never a libretro snapshot', () => {
    expect(tileImageKey(null, null, null)).toBeNull()
    expect(tileImageKey(null, 'art/a/1-tile.webp', 'snap')).toBeNull()
    expect(tileImageKey('art/a/1-tile.webp', 'art/a/1-tile.webp', 'title')).toBeNull()
  })
})
