import { PrismaClient } from '@prisma/client'
import { linkGame } from './catalog'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient; sqliteTuned?: boolean }

// SQLite requires connection_limit=1 — multiple concurrent writers cause P1008 timeouts.
// We append it here at runtime so it works regardless of what DATABASE_URL looks like.
function buildDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? ''
  if (url.includes('connection_limit')) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}connection_limit=1`
}

/** The plain client: what the catalog itself writes with, so the hook never re-enters. */
export const rawDb =
  globalForPrisma.prisma ??
  new PrismaClient({ datasources: { db: { url: buildDatabaseUrl() } } })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = rawDb

// The text fields the editor, the metadata providers, Wikidata, the graveyard and
// the merge all write. Whenever one of them is written, the game is re-linked to its
// canonical company and genre rows, wherever the write came from.
const FACT_FIELDS = ['publisher', 'developer', 'genre'] as const
const touchesFacts = (data: unknown) =>
  !!data && typeof data === 'object' && FACT_FIELDS.some(k => k in (data as object))

function relink(gameId: number | undefined): Promise<void> {
  if (gameId == null) return Promise.resolve()
  return linkGame(rawDb, gameId).catch(err => {
    // A catalog hiccup must not fail the metadata write that caused it.
    console.error('[catalog] could not link game', gameId, err)
  })
}

export const db = rawDb.$extends({
  query: {
    game: {
      async create({ args, query }) {
        const game = await query(args)
        if (touchesFacts(args.data)) await relink(game.id)
        return game
      },
      async update({ args, query }) {
        const game = await query(args)
        if (touchesFacts(args.data)) await relink(game.id)
        return game
      },
      async upsert({ args, query }) {
        const game = await query(args)
        if (touchesFacts(args.create) || touchesFacts(args.update)) await relink(game.id)
        return game
      },
      async updateMany({ args, query }) {
        const result = await query(args)
        if (touchesFacts(args.data)) {
          const ids = await rawDb.game.findMany({ where: args.where, select: { id: true } })
          for (const { id } of ids) await relink(id)
        }
        return result
      },
    },
  },
})

if (!globalForPrisma.sqliteTuned) {
  globalForPrisma.sqliteTuned = true
  // WAL lets readers (the web, the backup) run while the one writer writes, and
  // busy_timeout makes a write wait for the lock instead of failing at once. Both
  // are per connection, and connection_limit=1 keeps the client on a single one.
  rawDb.$queryRawUnsafe('PRAGMA busy_timeout = 5000')
    .then(() => rawDb.$queryRawUnsafe('PRAGMA journal_mode = WAL'))
    .catch(err => console.error('[db] sqlite pragmas failed:', err))
}
