import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/metadata/launchbox', () => ({
  getLaunchBoxPlatformName: vi.fn(async () => 'Nintendo Switch'),
  getLaunchBoxProvider: vi.fn(async () => ({
    search: vi.fn(async () => { throw new Error('fetch timeout') }),
    fetchById: vi.fn(async () => null),
  })),
  LAUNCHBOX_PLATFORM_NAMES: {},
}))
vi.mock('@/lib/metadata/nintendo-store', () => ({
  searchStore: vi.fn(async () => null),
  fetchStoreProduct: vi.fn(async () => null),
}))

import { gatherMetadata, StoreUnavailableError } from '@/lib/metadata/compose'

const matrix = {
  cover: 'launchbox', info: 'launchbox', description: 'launchbox', screenshots: 'launchbox',
  chains: { cover: ['launchbox'], info: ['launchbox'], description: ['launchbox'], screenshots: ['launchbox'] },
} as never

describe('caída de LaunchBox', () => {
  it('no marca «sin coincidencia» cuando LaunchBox no responde', async () => {
    await expect(gatherMetadata({ title: 'Samurai Warrior', platformSlug: 'switch', matrix }))
      .rejects.toBeInstanceOf(StoreUnavailableError)
  })

  it('nombra LaunchBox y no la tienda de Nintendo', async () => {
    await expect(gatherMetadata({ title: 'Samurai Warrior', platformSlug: 'switch', matrix }))
      .rejects.toThrow('LaunchBox no responde: fetch timeout')
  })
})
