import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/s3', () => ({ uploadCoverToS3: vi.fn() }))

import { coverColumnsOf, NO_COVER_COLUMNS } from '@/lib/covers'

describe('a cover and its size move together', () => {
  it('a copy takes the path, the proportion and the size, not the path alone', () => {
    const source = { coverPath: 'covers/x/1.webp', coverRatio: 0.67, coverWidth: 600, coverHeight: 900 }
    expect(coverColumnsOf({ ...source, coverRatio: source.coverRatio, coverWidth: source.coverWidth, coverHeight: source.coverHeight }))
      .toEqual(source)
  })

  it('a removed cover clears all four columns', () => {
    expect(NO_COVER_COLUMNS).toEqual({ coverPath: null, coverRatio: null, coverWidth: null, coverHeight: null })
  })
})
