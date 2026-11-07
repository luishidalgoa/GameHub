import { describe, it, expect } from 'vitest'
import { matchStoreSearch, parseAppDetails, steamTitleKey, stripSteamHtml, toMetadata } from '@/lib/metadata/steam'

describe('the title comparison ignores accents, case and punctuation', () => {
  it('Pokémon and pokemon, Zelda: Link\'s and Zelda Links are compared by their letters', () => {
    expect(steamTitleKey('Pokémon Crystal')).toBe('pokemoncrystal')
    expect(steamTitleKey("Zelda: Link's Awakening")).toBe('zeldalinksawakening')
  })
})

describe('the store search matches an exact title and only base games', () => {
  const json = {
    items: [
      { type: 'app', id: 111, name: 'Hollow Knight: Silksong' },
      { type: 'app', id: 222, name: 'Hollow Knight' },
      { type: 'sub', id: 333, name: 'Hollow Knight' },
    ],
  }
  it('returns the id of the app with the same name', () => {
    expect(matchStoreSearch(json, 'hollow knight')).toBe(222)
  })
  it('returns null when no app has that exact name', () => {
    expect(matchStoreSearch(json, 'Hollow')).toBeNull()
    expect(matchStoreSearch({ items: [] }, 'Hollow Knight')).toBeNull()
  })
  it('ignores a package that is not an app', () => {
    expect(matchStoreSearch({ items: [{ type: 'sub', id: 9, name: 'Only a package' }] }, 'Only a package')).toBeNull()
  })
})

describe('the app details become provider metadata, and only for games', () => {
  const details = {
    '570': {
      success: true,
      data: {
        type: 'game',
        name: 'Dota 2',
        short_description: 'Free to play.',
        detailed_description: '<p>A <strong>team</strong> game &amp; more.</p><br><p>Second&nbsp;paragraph.</p>',
        developers: ['Valve'],
        publishers: ['Valve', 'Other'],
        genres: [{ description: 'Action' }, { description: 'Free to Play' }],
        release_date: { date: '9 Jul, 2013' },
        screenshots: [{ path_full: 'https://cdn.example/ss1.jpg' }, { path_full: 'https://cdn.example/ss2.jpg' }],
        background_raw: 'https://cdn.example/bg.jpg',
        header_image: 'https://cdn.example/header.jpg',
      },
    },
  }

  it('reads a game and maps its fields', () => {
    const app = parseAppDetails(details, 570)
    expect(app).not.toBeNull()
    const m = toMetadata(app!, 'Dota 2')
    expect(m.source).toBe('steam')
    expect(m.developer).toBe('Valve')
    expect(m.publisher).toBe('Valve, Other')
    expect(m.releaseYear).toBe(2013)
    expect(m.genre).toBe('Action, Free to Play')
    expect(m.screenshots).toEqual(['https://cdn.example/ss1.jpg', 'https://cdn.example/ss2.jpg'])
    expect(m.description).toBe('A team game & more.\n\nSecond paragraph.')
  })

  it('a DLC or a failed response is not a game', () => {
    expect(parseAppDetails({ '1': { success: true, data: { type: 'dlc' } } }, 1)).toBeNull()
    expect(parseAppDetails({ '1': { success: false } }, 1)).toBeNull()
    expect(parseAppDetails(null, 1)).toBeNull()
  })
})

describe('Steam descriptions are plain text', () => {
  it('drops tags and decodes the common entities', () => {
    expect(stripSteamHtml('<b>Bold</b> &quot;quoted&quot; &ndash; end')).toBe('Bold "quoted" – end')
  })
  it('an empty description is no description', () => {
    expect(stripSteamHtml('<p></p>')).toBeUndefined()
    expect(stripSteamHtml(undefined)).toBeUndefined()
  })
})
