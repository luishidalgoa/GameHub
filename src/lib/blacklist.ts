import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { torrentKeyOf } from '@/lib/games/torrent-key'

// The torrent blacklist: identities the catalog sync must never bring back. A game
// from a torrent source is keyed `torrent:<source>:<identity>`; the blacklist entry
// holds the same identity under its platform. Local files cannot be blacklisted:
// they have no catalog identity, and the scanner owns them.

export { torrentKeyOf, type TorrentKey } from '@/lib/games/torrent-key'

const DEFAULT_REASON = 'Añadido desde la administración'

/** What the admin can do with a game in the blacklist: a local file, already listed, or free. */
export type BlacklistState = 'local' | 'listed' | 'free'

export async function blacklistStateOf(game: { platformId: number; externalKey: string | null }): Promise<BlacklistState> {
  const key = torrentKeyOf(game.externalKey)
  if (!key) return 'local'
  const entry = await db.torrentBlacklist.findUnique({
    where: { platformId_identity: { platformId: game.platformId, identity: key.identity } },
    select: { id: true },
  })
  return entry ? 'listed' : 'free'
}

export type BlacklistAddResult = {
  /** Games the admin selected. */
  requested: number
  /** Newly listed. */
  listed: number
  /** Already in the list before. */
  alreadyListed: number
  /** Local files, or rows without a catalog key: they cannot be listed. */
  notBlacklistable: number
}

/**
 * Lists the torrent games and hides them, so the sync keeps them out. Idempotent:
 * a game already listed counts as such and stays hidden.
 */
export async function addToBlacklist(gameIds: number[], reason = DEFAULT_REASON): Promise<BlacklistAddResult> {
  const games = await db.game.findMany({
    where: { id: { in: gameIds } },
    select: { id: true, title: true, platformId: true, externalKey: true },
  })
  let listed = 0
  let alreadyListed = 0
  let notBlacklistable = 0
  const hideIds: number[] = []
  for (const g of games) {
    const key = torrentKeyOf(g.externalKey)
    if (!key) { notBlacklistable++; continue }
    hideIds.push(g.id)
    try {
      await db.torrentBlacklist.create({
        data: { platformId: g.platformId, identity: key.identity, source: key.source, title: g.title, reason },
      })
      listed++
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') alreadyListed++
      else throw err
    }
  }
  if (hideIds.length) {
    await db.game.updateMany({ where: { id: { in: hideIds } }, data: { isHidden: true, userHidden: true } })
  }
  return { requested: gameIds.length, listed, alreadyListed, notBlacklistable }
}

export type BlacklistRemoveResult = { removed: number; revealed: number }

async function removeEntriesWhere(where: Prisma.TorrentBlacklistWhereInput): Promise<BlacklistRemoveResult> {
  const entries = await db.torrentBlacklist.findMany({ where, select: { id: true, platformId: true, identity: true, source: true } })
  if (entries.length === 0) return { removed: 0, revealed: 0 }
  await db.torrentBlacklist.deleteMany({ where: { id: { in: entries.map(e => e.id) } } })
  // The game row, if it still exists, comes back as visible. The sync decides the rest.
  let revealed = 0
  for (const e of entries) {
    if (!e.source) continue
    const r = await db.game.updateMany({
      where: { platformId: e.platformId, externalKey: `torrent:${e.source}:${e.identity}` },
      data: { isHidden: false, userHidden: false },
    })
    revealed += r.count
  }
  return { removed: entries.length, revealed }
}

/** Takes games out of the list through their catalog identity. Local files have none. */
export async function unblacklistGames(gameIds: number[]): Promise<BlacklistRemoveResult> {
  const games = await db.game.findMany({ where: { id: { in: gameIds } }, select: { platformId: true, externalKey: true } })
  const or = games.flatMap(g => {
    const key = torrentKeyOf(g.externalKey)
    return key ? [{ platformId: g.platformId, identity: key.identity }] : []
  })
  if (or.length === 0) return { removed: 0, revealed: 0 }
  return removeEntriesWhere({ OR: or })
}

/** Takes entries out of the list by their own id (the blacklist page). */
export async function unblacklistEntries(entryIds: number[]): Promise<BlacklistRemoveResult> {
  return removeEntriesWhere({ id: { in: entryIds } })
}

export interface BlacklistPageOptions {
  search?: string
  page?: number
  pageSize?: number
}

/** One page of the blacklist, newest first, filtered by title. */
export async function listBlacklist({ search = '', page = 1, pageSize = 50 }: BlacklistPageOptions = {}) {
  const where: Prisma.TorrentBlacklistWhereInput = search ? { title: { contains: search } } : {}
  const take = Math.min(200, Math.max(1, pageSize))
  const skip = (Math.max(1, page) - 1) * take
  const [items, total] = await Promise.all([
    db.torrentBlacklist.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
      select: { id: true, title: true, identity: true, source: true, reason: true, createdAt: true, platform: { select: { name: true, slug: true } } },
    }),
    db.torrentBlacklist.count({ where }),
  ])
  return { items, total, page: Math.max(1, page), pageSize: take }
}
