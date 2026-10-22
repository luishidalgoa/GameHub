import { describe, it, expect } from 'vitest'
import { chooseCover } from '@/lib/metadata/compose'
import type { ProviderMatrix } from '@/lib/metadata/matrix'
import type { MetadataResult } from '@/lib/metadata/provider'

// RAWG's image field is a screenshot, so it never becomes a cover, even when the
// platform's matrix asks for RAWG on covers.
const matrix = (cover: ProviderMatrix['cover']) => ({ cover, info: 'launchbox', description: 'launchbox', screenshots: 'launchbox' }) as ProviderMatrix
const noSource = async () => null

describe('cover choice', () => {
  it('a RAWG screenshot is not a cover, even when the matrix asks for RAWG', async () => {
    const rawg = { title: 'Game', coverUrl: 'https://api.rawg.io/shot.jpg' } as MetadataResult
    const cover = await chooseCover({ matrix: matrix('rawg'), lb: null, rawg, sgdbTitle: 'Game', libretroBox: noSource, sgdbCover: noSource })
    expect(cover).toBeNull()
  })

  it('a RAWG screenshot is not a last-resort cover either', async () => {
    const rawg = { title: 'Game', coverUrl: 'https://api.rawg.io/shot.jpg' } as MetadataResult
    const cover = await chooseCover({ matrix: matrix('steamgriddb'), lb: null, rawg, sgdbTitle: 'Game', libretroBox: noSource, sgdbCover: noSource })
    expect(cover).toBeNull()
  })

  it('LaunchBox box art is still used when the matrix asks for it', async () => {
    const lb = { title: 'Game', coverUrl: 'https://images.launchbox-app.com/box.jpg' } as never
    const cover = await chooseCover({ matrix: matrix('launchbox'), lb, rawg: null, sgdbTitle: 'Game', libretroBox: noSource, sgdbCover: noSource })
    expect(cover).toEqual({ coverUrl: 'https://images.launchbox-app.com/box.jpg', source: 'launchbox' })
  })
})
