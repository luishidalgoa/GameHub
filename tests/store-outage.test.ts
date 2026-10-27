import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/metadata/nintendo-store', () => ({
  searchStore: vi.fn(async () => { throw new Error('fetch failed') }),
  fetchStoreProduct: vi.fn(async () => null),
}))

import { gatherMetadata, StoreUnavailableError } from '@/lib/metadata/compose'

const matrix = {
  cover: 'libretro', info: 'launchbox', description: 'launchbox', screenshots: 'launchbox',
  chains: { cover: ['libretro'], info: ['launchbox', 'rawg'], description: ['launchbox'], screenshots: ['launchbox'] },
} as never

describe('caída de la tienda de Nintendo', () => {
  it('no responde "sin coincidencia" cuando la tienda no contesta', async () => {
    await expect(gatherMetadata({ title: 'Krystopia', platformSlug: 'switch', matrix }))
      .rejects.toBeInstanceOf(StoreUnavailableError)
  })
})
