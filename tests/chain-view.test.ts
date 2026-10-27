import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { chainFor, sourcesFor } from '@/lib/metadata/chain-view'

describe('which sources can answer for a platform', () => {
  it('Xbox 360 is reachable on LaunchBox, RAWG and Metacritic', () => {
    expect(sourcesFor('xbox-360')).toMatchObject({ launchbox: true, rawg: true, metacritic: true, libretro: true, store: false })
  })

  it('Switch adds the Nintendo store and no libretro cover', () => {
    expect(sourcesFor('switch')).toMatchObject({ store: true, libretro: false })
  })

  it('Game Boy resolves LaunchBox and Metacritic per console', () => {
    expect(sourcesFor('game-boy')).toMatchObject({ launchbox: true, metacritic: true, libretro: true })
  })

  it('an unknown platform reports every source as unavailable', () => {
    expect(sourcesFor('no-such-platform')).toEqual({
      launchbox: false, rawg: false, metacritic: false, libretro: false, store: false,
    })
  })
})

describe('the chain for one platform', () => {
  it('lists the match sources in the order the batch consults them', () => {
    const chain = chainFor({ slug: 'xbox-360', name: 'Xbox 360' })
    const order = chain.steps.map(s => s.id)
    expect(order.indexOf('launchbox')).toBeLessThan(order.indexOf('rawg'))
    expect(order.indexOf('rawg')).toBeLessThan(order.indexOf('libretro-cover'))
    expect(order.indexOf('no-match')).toBeGreaterThan(order.indexOf('libretro-cover'))
  })

  it('flags LaunchBox as missing for a platform without a LaunchBox name', () => {
    const chain = chainFor({ slug: 'no-such-platform', name: 'X' })
    expect(chain.steps.find(s => s.id === 'launchbox')?.state).toBe('missing')
  })

  it('marks the store step as not applicable outside Switch', () => {
    const chain = chainFor({ slug: 'xbox-360', name: 'Xbox 360' })
    expect(chain.steps.find(s => s.id === 'store')?.state).toBe('na')
  })

  it('does not state the field sources: those are edited in settings, as a chain', () => {
    const chain = chainFor({ slug: 'xbox-360', name: 'Xbox 360' })
    expect(chain.steps.some(s => s.id === 'fields')).toBe(false)
  })
})
