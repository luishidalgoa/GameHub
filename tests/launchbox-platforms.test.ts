import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { LAUNCHBOX_PLATFORM_NAMES } from '@/lib/metadata/launchbox'

// GameHub slugs the metadata batch runs on. Each one must resolve to a LaunchBox
// name from the built-in table: without it the catalog fallback reads the DB
// (empty on staging), returns null, and every game lands in no_match unsearched.
const SLUGS = [
  'ps1', 'ps2', 'psp', 'psvita', 'switch', 'wii', 'wii-u', 'gamecube', 'xbox', 'xbox-360',
  '3ds', 'nds', 'super-nintendo-entertainment-system', 'dreamcast', 'saturn', 'mega-drive',
  'master-system', 'game-gear', 'sega-cd', 'sega-32x', 'gb', 'gbc', 'gba',
]

describe('LaunchBox platform aliases', () => {
  it.each(SLUGS)('resolves %s from the built-in table', slug => {
    expect(LAUNCHBOX_PLATFORM_NAMES[slug]).toBeTruthy()
  })

  it('uses the platform names LaunchBox lists', () => {
    expect(LAUNCHBOX_PLATFORM_NAMES['xbox-360']).toBe('Microsoft Xbox 360')
    expect(LAUNCHBOX_PLATFORM_NAMES['wii-u']).toBe('Nintendo Wii U')
    expect(LAUNCHBOX_PLATFORM_NAMES['mega-drive']).toBe('Sega Genesis')
    expect(LAUNCHBOX_PLATFORM_NAMES['master-system']).toBe('Sega Master System')
    expect(LAUNCHBOX_PLATFORM_NAMES['sega-cd']).toBe('Sega CD')
    expect(LAUNCHBOX_PLATFORM_NAMES['sega-32x']).toBe('Sega 32X')
  })
})
