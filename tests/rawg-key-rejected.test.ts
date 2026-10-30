import { describe, it, expect, vi, beforeEach } from 'vitest'

const rawgFailure = vi.hoisted(() => ({ error: null as Error | null }))

vi.mock('@/lib/metadata/rawg', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/metadata/rawg')>()
  return {
    ...actual,
    getRawgProvider: vi.fn(() => ({
      search: vi.fn(async () => { throw rawgFailure.error }),
      fetchById: vi.fn(async () => { throw rawgFailure.error }),
    })),
  }
})
vi.mock('@/lib/metadata/launchbox', () => ({
  getLaunchBoxPlatformName: vi.fn(async () => 'Nintendo Switch'),
  getLaunchBoxProvider: vi.fn(async () => ({
    search: vi.fn(async () => []),
    fetchById: vi.fn(async () => null),
  })),
  LAUNCHBOX_PLATFORM_NAMES: {},
}))
vi.mock('@/lib/metadata/nintendo-store', () => ({
  searchStore: vi.fn(async () => null),
  fetchStoreProduct: vi.fn(async () => null),
}))

import { gatherMetadata, StoreUnavailableError } from '@/lib/metadata/compose'
import { RawgAuthError } from '@/lib/metadata/rawg'

const matrix = {
  cover: 'launchbox', info: 'launchbox', description: 'launchbox', screenshots: 'launchbox',
  chains: { cover: ['launchbox'], info: ['launchbox', 'rawg'], description: ['launchbox'], screenshots: ['launchbox'] },
} as never

describe('RAWG rechaza la clave mientras LaunchBox no encuentra el juego', () => {
  beforeEach(() => { rawgFailure.error = new RawgAuthError(401) })

  it('lanza el error de clave, no «sin coincidencia» ni un reintento', async () => {
    const err = await gatherMetadata({ title: 'Eindeloos Patience', platformSlug: 'nintendo-ds', matrix, rawgApiKey: 'bad' })
      .catch(e => e)
    expect(err).toBeInstanceOf(RawgAuthError)
    expect(err).not.toBeInstanceOf(StoreUnavailableError)
  })

  it('una caída de RAWG (500) sigue siendo un reintento', async () => {
    rawgFailure.error = new Error('RAWG search failed: 500')
    await expect(gatherMetadata({ title: 'Eindeloos Patience', platformSlug: 'nintendo-ds', matrix, rawgApiKey: 'k' }))
      .rejects.toBeInstanceOf(StoreUnavailableError)
  })
})
