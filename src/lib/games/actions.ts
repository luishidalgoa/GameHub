import { db } from '@/lib/db'
import { addToBlacklist, unblacklistEntries, unblacklistGames } from '@/lib/blacklist'

// The admin's actions over one or many games. Each action is a strategy: the panel
// and the bulk bar name it, the bulk route runs it, and nothing else knows how. The
// metadata fill is not here on purpose: it runs one game at a time through the
// metadata route, the same path as the button in the panel.

export type GameActionResult = Record<string, number>

export interface GameAction {
  /** Whether the action takes game ids or blacklist entry ids. */
  takes: 'games' | 'entries'
  run(ids: number[]): Promise<GameActionResult>
}

export const GAME_ACTIONS = {
  blacklist: {
    takes: 'games',
    run: ids => addToBlacklist(ids),
  },
  unblacklist: {
    takes: 'games',
    run: ids => unblacklistGames(ids),
  },
  unblacklistEntries: {
    takes: 'entries',
    run: ids => unblacklistEntries(ids),
  },
  favorite: {
    takes: 'games',
    run: async ids => ({ updated: (await db.game.updateMany({ where: { id: { in: ids } }, data: { isFavorite: true } })).count }),
  },
  unfavorite: {
    takes: 'games',
    run: async ids => ({ updated: (await db.game.updateMany({ where: { id: { in: ids } }, data: { isFavorite: false } })).count }),
  },
  // Hidden by hand (the cementerio). A game the scanner lost stays hidden on showing:
  // its file is still missing, and the scanner sets that state, not the admin.
  hide: {
    takes: 'games',
    run: async ids => ({ hidden: (await db.game.updateMany({ where: { id: { in: ids } }, data: { isHidden: true, userHidden: true } })).count }),
  },
  unhide: {
    takes: 'games',
    run: async ids => {
      const shown = await db.game.updateMany({
        where: { id: { in: ids }, missingSince: null },
        data: { isHidden: false, userHidden: false },
      })
      const stillMissing = await db.game.updateMany({
        where: { id: { in: ids }, missingSince: { not: null } },
        data: { userHidden: false },
      })
      return { shown: shown.count, stillMissing: stillMissing.count }
    },
  },
} satisfies Record<string, GameAction>

export type GameActionName = keyof typeof GAME_ACTIONS

export function isGameAction(name: unknown): name is GameActionName {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(GAME_ACTIONS, name)
}
