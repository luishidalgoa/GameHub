import type { PrismaClient } from '@prisma/client'
import { publisherKey } from '@/lib/publishers'
import { parseLocks } from '@/lib/manual-fields'

/**
 * The canonical catalog: one row per company and per genre, linked to the games.
 * The text columns on Game stay as the name the source gave; these rows are what
 * the data is grouped and counted by.
 *
 * Every function takes the client it writes with. The app's `db` calls these
 * itself from a write hook (src/lib/db.ts), so any code path that writes a game's
 * publisher, developer or genre is linked without knowing about the catalog.
 */

type Client = PrismaClient

const clean = (s: string | null | undefined) => (s ?? '').trim()

/** The company row for a name, created on first sight. Null for an empty name. */
export async function companyId(client: Client, name: string | null | undefined): Promise<number | null> {
  const n = clean(name)
  if (!n) return null
  const key = publisherKey(n)
  if (!key) return null
  // A merged duplicate's key resolves to the company it was merged into (#143).
  const alias = await client.companyAlias.findUnique({ where: { key }, select: { companyId: true } })
  if (alias) return alias.companyId
  const row = await client.company.upsert({ where: { key }, update: {}, create: { key, name: n }, select: { id: true } })
  return row.id
}

/** Genres of a game's comma-separated text, as canonical rows. */
export async function genreIds(client: Client, genre: string | null | undefined): Promise<number[]> {
  const out: number[] = []
  for (const part of clean(genre).split(',')) {
    const name = part.trim()
    if (!name) continue
    const key = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (!key) continue
    const row = await client.genre.upsert({
      where: { key }, update: {}, create: { key, name: name.charAt(0).toUpperCase() + name.slice(1) }, select: { id: true },
    })
    out.push(row.id)
  }
  return [...new Set(out)]
}

/** The company at the top of a company's owners: itself when it has no owner (#143). */
export async function topCompany(client: Client, id: number): Promise<{ id: number; name: string }> {
  const select = { id: true, name: true, parentId: true } as const
  type Row = { id: number; name: string; parentId: number | null }
  const start: Row | null = await client.company.findUnique({ where: { id }, select })
  if (!start) throw new Error(`company ${id} not found`)
  let current: Row = start
  const seen = new Set<number>()
  while (current.parentId !== null && !seen.has(current.id)) {
    seen.add(current.id)
    const owner: Row | null = await client.company.findUnique({ where: { id: current.parentId }, select })
    if (!owner) break
    current = owner
  }
  return { id: current.id, name: current.name }
}

/**
 * Links one game to its canonical company and genre rows from its text. A publisher
 * that belongs to an owner is written as the owner's name, so the game carries one
 * spelling per editora. A publisher the owner set by hand is left as it is (#143).
 */
export async function linkGame(client: Client, gameId: number): Promise<void> {
  const game = await client.game.findUnique({
    where: { id: gameId }, select: { publisher: true, developer: true, genre: true, manualFields: true },
  })
  if (!game) return
  const ownPublisherId = await companyId(client, game.publisher)
  const locked = parseLocks(game.manualFields).includes('publisher')
  const top = ownPublisherId === null || locked ? null : await topCompany(client, ownPublisherId)
  const owned = top !== null && top.id !== ownPublisherId ? top : null
  const developerCompanyId = await companyId(client, game.developer)
  const genres = await genreIds(client, game.genre)
  await client.game.update({
    where: { id: gameId },
    data: {
      publisherCompanyId: owned ? owned.id : ownPublisherId,
      ...(owned ? { publisher: owned.name } : {}),
      developerCompanyId,
      genres: { deleteMany: {}, create: genres.map(genreId => ({ genreId })) },
    },
  })
}

/** Links every game in the library. Idempotent: running it again changes nothing new. */
export async function normalizeCatalog(client: Client): Promise<{ games: number }> {
  let cursor = 0
  let games = 0
  for (;;) {
    const batch = await client.game.findMany({
      where: { id: { gt: cursor } }, select: { id: true }, orderBy: { id: 'asc' }, take: 200,
    })
    if (batch.length === 0) break
    for (const g of batch) {
      await linkGame(client, g.id)
      games++
    }
    cursor = batch[batch.length - 1].id
  }
  return { games }
}
