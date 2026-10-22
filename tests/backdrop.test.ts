import { describe, it, expect } from 'vitest'
import { backdropUrl } from '@/lib/tile-art'

const none = { tilePath: null, backdropPath: null, backdropKind: null, coverPath: null, coverUrl: null }

describe('the background rule, shared by home and the game page', () => {
  it('a LaunchBox banner wins over everything', () => {
    expect(backdropUrl({ ...none, backdropPath: 'repo/x/banner.webp', backdropKind: 'banner', coverPath: 'covers/x.webp' }))
      .toBe('/api/covers/proxy/repo/x/banner.webp')
  })

  it('a libretro snapshot is never a background; the box art is', () => {
    expect(backdropUrl({ ...none, backdropPath: 'repo/x/game-tile.webp', backdropKind: 'title', coverPath: 'covers/x.webp' }))
      .toBe('/api/covers/proxy/covers/x.webp')
  })

  it('with no art at all, the cover URL is the last resort', () => {
    expect(backdropUrl({ ...none, coverUrl: 'https://example.com/c.jpg' })).toBe('https://example.com/c.jpg')
    expect(backdropUrl(none)).toBeNull()
  })
})
