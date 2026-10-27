import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CHAINS, legacyChain, optionsFor, originOf, overrideOf, parseGlobal, parseOverride,
  resolveChains, sanitizeChain,
} from '@/lib/metadata/chains'

describe('a platform asks its sources in the order it has set', () => {
  it('Switch takes SteamGridDB as the cover fallback, after LaunchBox and before the Nintendo store', () => {
    const r = resolveChains(DEFAULT_CHAINS, null, 'switch')
    expect(r.cover).toEqual(['launchbox', 'steamgriddb', 'nintendo'])
  })

  it('its own chain beats the built-in default, which beats the global one', () => {
    const own = { cover: ['steamgriddb'] as const }
    expect(resolveChains(DEFAULT_CHAINS, { ...own } as never, 'switch').cover).toEqual(['steamgriddb'])
    expect(resolveChains(DEFAULT_CHAINS, null, 'xbox-360').cover).toEqual(DEFAULT_CHAINS.cover)
  })

  it('an empty own chain is kept: the platform asks no source for that kind of data', () => {
    expect(resolveChains(DEFAULT_CHAINS, { screenshots: [] }, 'xbox-360').screenshots).toEqual([])
  })

  it('a source the platform cannot use is dropped', () => {
    expect(sanitizeChain('cover', ['nintendo', 'launchbox'], 'xbox-360')).toEqual(['launchbox'])
    expect(sanitizeChain('cover', 'launchbox', 'switch')).toBeNull()
  })

  it('duplicates are kept once', () => {
    expect(sanitizeChain('info', ['rawg', 'rawg', 'launchbox'], 'xbox-360')).toEqual(['rawg', 'launchbox'])
  })
})

describe('the settings that came before the chains', () => {
  it('one primary cover becomes a chain with the usual fallbacks', () => {
    expect(legacyChain('cover', 'steamgriddb')).toEqual(['steamgriddb', 'launchbox', 'libretro'])
  })

  it('screenshots never fell back to another source, except to LaunchBox', () => {
    expect(legacyChain('screenshots', 'launchbox')).toEqual(['launchbox'])
    expect(legacyChain('screenshots', 'rawg')).toEqual(['rawg', 'launchbox'])
    expect(legacyChain('screenshots', 'none')).toEqual([])
  })

  it('an unknown primary converts to nothing', () => {
    expect(legacyChain('info', 'steamgriddb')).toBeNull()
  })

  it('the global setting reads the old keys when the chains are not saved yet', () => {
    expect(parseGlobal(null, { cover: 'libretro' }).cover).toEqual(['libretro', 'launchbox', 'steamgriddb'])
    expect(parseGlobal('not json', {}).info).toEqual(DEFAULT_CHAINS.info)
  })

  it('a platform keeps its old single-source columns until its chains are saved', () => {
    // RAWG was never a cover source: the old setting inherited the usual chain.
    expect(overrideOf('xbox-360', null, { cover: 'rawg' })).toBeNull()
    expect(overrideOf('xbox-360', null, { cover: 'none' })?.cover).toEqual([])
    const saved = overrideOf('xbox-360', JSON.stringify({ cover: ['steamgriddb'] }), { cover: 'rawg' })
    expect(saved?.cover).toEqual(['steamgriddb'])
  })
})

describe('where a chain comes from', () => {
  it('a saved override reads back, dropping what is not valid', () => {
    expect(parseOverride(JSON.stringify({ cover: ['nintendo', 'libretro'], info: 'rawg' }), 'xbox-360')).toEqual({ cover: ['libretro'] })
  })

  it('the origin of each field says whether it is the platform, its default, or the global', () => {
    expect(originOf('cover', { cover: ['steamgriddb'] }, 'xbox-360')).toBe('platform')
    expect(originOf('cover', null, 'switch')).toBe('builtin')
    expect(originOf('cover', null, 'xbox-360')).toBe('global')
  })

  it('the Nintendo option is only offered for Switch', () => {
    expect(optionsFor('cover', 'switch')).toContain('nintendo')
    expect(optionsFor('cover', 'xbox-360')).not.toContain('nintendo')
  })
})

describe('stale choices do not turn into "no source"', () => {
  it('a list that holds only sources the platform cannot use is not a choice', () => {
    expect(sanitizeChain('cover', ['nintendo'], 'mario')).toBeNull()
    expect(parseOverride(JSON.stringify({ cover: ['nintendo'], info: ['rawg'] }), 'mario')).toEqual({ info: ['rawg'] })
  })

  it('an explicitly empty list still means no source', () => {
    expect(sanitizeChain('screenshots', [], 'mario')).toEqual([])
  })

  it('an old single source on Switch keeps the Switch fallbacks', () => {
    const chain = overrideOf('switch', null, { cover: 'launchbox' })
    expect(chain?.cover).toEqual(['launchbox', 'steamgriddb', 'nintendo'])
    expect(resolveChains(DEFAULT_CHAINS, chain, 'switch').cover).toEqual(['launchbox', 'steamgriddb', 'nintendo'])
  })
})
