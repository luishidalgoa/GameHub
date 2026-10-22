import { describe, it, expect } from 'vitest'
import { hasRichMetadata, isValuableForArt, RICH_DESCRIPTION_MIN } from '@/lib/art-value'

const rich = { description: 'x'.repeat(RICH_DESCRIPTION_MIN), releaseYear: 2001, developer: 'Dev', genre: 'Action', rawgAdded: null }

describe('what makes a game worth manual art', () => {
  it('needs all four metadata fields, with a real description', () => {
    expect(hasRichMetadata(rich)).toBe(true)
    expect(hasRichMetadata({ ...rich, description: 'x'.repeat(RICH_DESCRIPTION_MIN - 1) })).toBe(false)
    expect(hasRichMetadata({ ...rich, releaseYear: null })).toBe(false)
    expect(hasRichMetadata({ ...rich, developer: '  ' })).toBe(false)
    expect(hasRichMetadata({ ...rich, genre: null })).toBe(false)
  })

  it('is valuable when it is popular on RAWG or was downloaded', () => {
    expect(isValuableForArt({ ...rich, rawgAdded: 5 }, false)).toBe(true)
    expect(isValuableForArt(rich, true)).toBe(true)
    expect(isValuableForArt(rich, false)).toBe(false)
  })

  it('a popular game with thin metadata is not valuable', () => {
    expect(isValuableForArt({ ...rich, description: 'corta', rawgAdded: 900 }, true)).toBe(false)
  })
})

import { selectArtGames, DEFAULT_ART_FILTER, type ArtCandidate } from '@/lib/art-value'

const game = (id: number, over: Partial<ArtCandidate> = {}): ArtCandidate => ({
  id, description: 'x'.repeat(RICH_DESCRIPTION_MIN), releaseYear: 2001, developer: 'Dev', genre: 'Action',
  rawgAdded: null, backdropPath: null, logoPath: null, platformName: 'GBA', ...over,
})

describe('selecting games for art', () => {
  const games = [
    game(1, { rawgAdded: 10 }),                     // valuable
    game(2),                                        // rich but unpopular, not downloaded
    game(3, { description: 'corta', rawgAdded: 9 }), // popular but thin
    game(4, { platformName: 'SNES', rawgAdded: 1 }),
  ]
  const none = new Set<number>()

  it('the default view is the valuable games, with both missing kinds', () => {
    expect(selectArtGames(games, DEFAULT_ART_FILTER, none)).toEqual([
      { id: 1, missing: 'fanart' }, { id: 1, missing: 'logo' }, { id: 4, missing: 'fanart' }, { id: 4, missing: 'logo' },
    ])
  })

  it('the rest stay reachable: the "todos" view includes every game', () => {
    const ids = new Set(selectArtGames(games, { ...DEFAULT_ART_FILTER, vista: 'todos' }, none).map(x => x.id))
    expect([...ids].sort()).toEqual([1, 2, 3, 4])
  })

  it('the "pobres" view shows the thin records', () => {
    const ids = new Set(selectArtGames(games, { ...DEFAULT_ART_FILTER, vista: 'pobres' }, none).map(x => x.id))
    expect([...ids].sort()).toEqual([3])
  })

  it('the platform and the missing kind narrow the list', () => {
    expect(selectArtGames(games, { vista: 'todos', falta: 'logo', plataforma: 'SNES' }, none))
      .toEqual([{ id: 4, missing: 'logo' }])
  })
})
