import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { RAWG_PLATFORM_SLUGS } from '@/lib/metadata/rawg'
import type { MetadataResult as Result } from '@/lib/metadata/provider'
import { METACRITIC_PLATFORM_SLUGS, fetchMetacriticScore } from '@/lib/metadata/metacritic'
import { LIBRETRO_SYSTEMS, libretroSystemFor, libretroSystemsFor } from '@/lib/metadata/libretro'
import { calcConfidence, AUTO_THRESHOLD } from '@/lib/metadata/scoring'
import { consoleSlugFor } from '@/lib/metadata/platform-console'

// GameHub platform slugs in the library. game-boy is one platform for gb, gbc and gba.
const SLUGS = [
  'ps1', 'ps2', 'psp', 'psvita', 'psvita-ports', 'switch', 'wii', 'wii-u', 'gamecube', 'xbox',
  'xbox-360', '3ds', 'nds', 'super-nintendo-entertainment-system', 'dreamcast', 'saturn',
  'mega-drive', 'master-system', 'game-gear', 'sega-cd', 'sega-32x', 'game-boy',
]

const result = (platformSlugs: string[]) =>
  ({ id: 1, slug: 'x', title: 'Tetris', platformSlugs, source: 'rawg' }) as unknown as Result

describe('RAWG platform map', () => {
  it.each(SLUGS)('has a RAWG list for %s', slug => {
    expect(RAWG_PLATFORM_SLUGS[slug]?.length).toBeGreaterThan(0)
  })

  it('lists every Game Boy console under game-boy', () => {
    expect(RAWG_PLATFORM_SLUGS['game-boy']).toEqual(['game-boy', 'game-boy-color', 'game-boy-advance'])
  })

  it('maps Xbox 360 and Wii U to RAWG\'s own slugs', () => {
    expect(RAWG_PLATFORM_SLUGS['xbox-360']).toEqual(['xbox360'])
    expect(RAWG_PLATFORM_SLUGS['wii-u']).toEqual(['wii-u'])
    expect(RAWG_PLATFORM_SLUGS['wiiu']).toBeUndefined()
  })

  it('rejects a Game Boy candidate that is only on SNES', () => {
    expect(calcConfidence('Tetris', 'game-boy', result(['snes']))).toBe(0)
  })

  it('accepts a Game Boy Color candidate for game-boy', () => {
    expect(calcConfidence('Tetris', 'game-boy', result(['game-boy-color']))).toBeGreaterThanOrEqual(AUTO_THRESHOLD)
  })

  it('rejects an original Xbox candidate for Xbox 360', () => {
    expect(calcConfidence('Halo 3', 'xbox-360', result(['xbox-old']))).toBe(0)
  })
})

describe('Metacritic platform map', () => {
  it.each(SLUGS.filter(s => s !== 'game-boy'))('has a Metacritic segment for %s', slug => {
    expect(METACRITIC_PLATFORM_SLUGS[slug]).toBeTruthy()
  })

  it('has no segment for game-boy: its console comes per game', () => {
    expect(METACRITIC_PLATFORM_SLUGS['game-boy']).toBeUndefined()
  })

  it('never falls back to the generic page for game-boy without a console', async () => {
    await expect(fetchMetacriticScore('Tetris', 'game-boy', null)).resolves.toBeNull()
  })
})

describe('libretro platform map', () => {
  it.each(SLUGS.filter(s => s !== 'switch'))('can serve %s', slug => {
    expect(libretroSystemsFor(slug).length).toBeGreaterThan(0)
  })

  it('keys Wii U as wii-u', () => {
    expect(LIBRETRO_SYSTEMS['wii-u']).toBe('Nintendo - Wii U')
    expect(LIBRETRO_SYSTEMS['wiiu']).toBeUndefined()
  })

  it('serves Game Boy from the game\'s own console', () => {
    expect(libretroSystemFor('game-boy', { filePath: '/roms/Tetris.gbc' })).toBe('gbc')
  })
})

describe('consoleSlugFor', () => {
  it('reads a Game Boy console from the file extension', () => {
    expect(consoleSlugFor('game-boy', { filePath: '/roms/Metroid.GBA' })).toBe('gba')
  })

  it('reads a Game Boy console from the torrent identity', () => {
    expect(consoleSlugFor('game-boy', { externalKey: 'torrent:minerva-gb:key:gbc:Tetris' })).toBe('gbc')
  })

  it('reads a Game Boy console from the torrent source', () => {
    expect(consoleSlugFor('game-boy', { externalKey: 'torrent:minerva-gba:id:1234' })).toBe('gba')
  })

  it('returns null when a Game Boy game has no console', () => {
    expect(consoleSlugFor('game-boy', {})).toBeNull()
  })

  it('keeps any other platform as its own console', () => {
    expect(consoleSlugFor('snes', { filePath: '/roms/Game.gb' })).toBe('snes')
  })
})
