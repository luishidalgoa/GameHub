import { describe, it, expect } from 'vitest'
import { coverShapeOf, DEFAULT_BOX_RATIO } from '@/lib/cover-shape'

// A platform with a main 2:3 box and a secondary square box (its official alternate).
const platform = { thumbnailWidth: 200, thumbnailHeight: 300, altThumbnailWidth: 200, altThumbnailHeight: 200 }

describe('coverShapeOf: the frame a cover is shown in, as in the grid', () => {
  it('a cover of the main box keeps the main shape and is cropped to it', () => {
    expect(coverShapeOf(0.67, platform)).toEqual({ ratio: 200 / 300, whole: false })
  })

  it('a cover of the secondary box takes that shape and is kept whole', () => {
    expect(coverShapeOf(1, platform)).toEqual({ ratio: 1, whole: true })
  })

  it('art (neither box) takes the main box and is cropped, as before', () => {
    expect(coverShapeOf(1.8, platform)).toEqual({ ratio: 200 / 300, whole: false })
  })

  it('a cover with no measured ratio, or a platform without a secondary box, takes the main box', () => {
    expect(coverShapeOf(null, platform)).toEqual({ ratio: 200 / 300, whole: false })
    expect(coverShapeOf(1, { thumbnailWidth: 200, thumbnailHeight: 300 })).toEqual({ ratio: 200 / 300, whole: false })
    expect(coverShapeOf(0.67, null)).toEqual({ ratio: 200 / 300, whole: false })
    expect(coverShapeOf(undefined, undefined).ratio).toBe(DEFAULT_BOX_RATIO)
  })
})
