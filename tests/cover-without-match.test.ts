import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/metadata/launchbox', () => ({
  getLaunchBoxPlatformName: vi.fn(async () => 'Nintendo Switch'),
  getLaunchBoxProvider: vi.fn(async () => ({
    search: vi.fn(async () => []),
    fetchById: vi.fn(async () => null),
  })),
  LAUNCHBOX_PLATFORM_NAMES: {},
}))
vi.mock('@/lib/metadata/nintendo', () => ({
  nintendoConsoleOf: (slug: string) => (slug === 'switch' || slug === 'switch-2' ? slug : null),
  findNintendoExact: vi.fn(async () => null),
  fetchNintendoPage: vi.fn(async () => ({ gallery: [], description: undefined })),
  nintendoMetadata: vi.fn(() => null),
}))
vi.mock('@/lib/metadata/libretro', () => ({
  fetchLibretroCover: vi.fn(async () => 'https://example.test/box.png'),
}))
vi.mock('@/lib/metadata/cover-choice', () => ({
  chooseCover: vi.fn(async () => ({ coverUrl: 'https://example.test/box.png', buffer: undefined, width: 300, height: 400 })),
}))

import { gatherMetadata } from '@/lib/metadata/compose'

const matrix = {
  cover: 'libretro', info: 'launchbox', description: 'launchbox', screenshots: 'launchbox',
  chains: { cover: ['libretro'], info: ['launchbox', 'rawg'], description: ['launchbox'], screenshots: ['launchbox'] },
} as never

describe('portada sin ficha', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('sin coincidencia y sin permiso, no guarda la caja de libretro', async () => {
    const meta = await gatherMetadata({ title: 'Rune Factory 2', platformSlug: 'switch', matrix, coverWithoutMatch: false })
    expect(meta).toBeNull()
  })

  it('sin coincidencia por defecto, sigue dando la caja de libretro (ficha manual)', async () => {
    const meta = await gatherMetadata({ title: 'Rune Factory 2', platformSlug: 'switch', matrix })
    expect(meta).not.toBeNull()
    expect(meta?.sources.cover).toBe('libretro')
    expect(meta?.sources.info).toBeUndefined()
  })
})
