import { describe, it, expect } from 'vitest'
import { tileImageKey } from '@/lib/tile-art'

describe('tileImageKey', () => {
  it('uses the fanart when there is one', () => {
    expect(tileImageKey('repo/a/1/fanart.webp', 'repo/a/1/banner.webp', 'banner')).toBe('repo/a/1/fanart.webp')
  })
  it('falls back to a banner, then a square, then a title screen', () => {
    expect(tileImageKey(null, 'repo/a/1/banner.webp', 'banner')).toBe('repo/a/1/banner.webp')
    expect(tileImageKey(null, 'repo/a/1/sq.webp', 'square')).toBe('repo/a/1/sq.webp')
    expect(tileImageKey(null, 'repo/a/1/title.webp', 'title')).toBe('repo/a/1/title.webp')
  })
  it('keeps the box art for games with no wide art, and for libretro snapshots', () => {
    expect(tileImageKey(null, null, null)).toBeNull()
    expect(tileImageKey(null, 'art/a/1-tile.webp', 'snap')).toBeNull()
    expect(tileImageKey(null, 'art/a/1-tile.webp', 'title')).toBeNull()
  })
})
