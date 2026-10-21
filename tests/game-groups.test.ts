import { describe, it, expect } from 'vitest'
import { groupByTitle, titleKey } from '@/lib/game-groups'
import type { TileGame } from '@/lib/home-data'

const g = (id: number, title: string, platform: string, fanart = false): TileGame => ({
  id, title, platformName: platform, platformSlug: platform.toLowerCase(), image: fanart ? 'x' : null,
  fanart, cover: 'c', backdrop: null, logo: null, palette: null, year: null, genre: null,
  publisher: null, score: null, description: null, platformSlug_: undefined,
} as unknown as TileGame)

describe('titleKey', () => {
  it('ignores case, accents and punctuation', () => {
    expect(titleKey('Pokémon Violet!')).toBe(titleKey('pokemon violet'))
  })
})

describe('groupByTitle', () => {
  it('folds the same game on several platforms into one entry, keeping every platform', () => {
    const groups = groupByTitle([g(1, 'Super Mario Galaxy', 'Wii'), g(2, 'Super Mario Galaxy 2', 'Wii'), g(3, 'super mario galaxy', 'Switch')])
    expect(groups).toHaveLength(2)
    expect(groups[0].platforms.map(p => p.name)).toEqual(['Wii', 'Switch'])
  })
  it('represents a group by its fanart when any platform has it', () => {
    const [group] = groupByTitle([g(1, 'Doom', 'Wii'), g(2, 'Doom', 'PSP', true)])
    expect(group.game.id).toBe(2)
  })
})
