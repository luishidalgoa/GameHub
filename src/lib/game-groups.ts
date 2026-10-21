import type { TileGame } from './home-data'

/** One title in a grid, with every platform it is in. */
export interface GameGroup {
  /** The entry the tile links to and draws: the one with box art when any platform has it, else the first. */
  game: TileGame
  platforms: { id: number; name: string }[]
}

/** A title as the same word-for-word on every platform: accents, case and punctuation do not count. */
export function titleKey(title: string): string {
  return title
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Folds the same game on several platforms into one entry. A grid showing each
 * platform's copy separately repeats the same picture, which reads as a mistake.
 * Keeps the order of first appearance.
 */
export function groupByTitle(games: TileGame[]): GameGroup[] {
  const groups = new Map<string, GameGroup>()
  for (const g of games) {
    const key = titleKey(g.title)
    const found = groups.get(key)
    if (!found) {
      groups.set(key, { game: g, platforms: [{ id: g.id, name: g.platformName }] })
      continue
    }
    found.platforms.push({ id: g.id, name: g.platformName })
    if (!found.game.cover && g.cover) found.game = g
  }
  return [...groups.values()]
}
