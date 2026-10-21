import { db } from '@/lib/db'
import { publisherKey } from '@/lib/publishers'

/**
 * The canonical catalog: one row per company and per genre, linked to the games.
 * The text columns on Game stay as the name the source gave; these rows are what
 * the data is grouped and counted by.
 */

const clean = (s: string | null | undefined) => (s ?? '').trim()

/** The company row for a name, created on first sight. Null for an empty name. */
export async function companyId(name: string | null | undefined): Promise<number | null> {
  const n = clean(name)
  if (!n) return null
  const key = publisherKey(n)
  if (!key) return null
  const row = await db.company.upsert({ where: { key }, update: {}, create: { key, name: n }, select: { id: true } })
  return row.id
}

/** Genres of a game's comma-separated text, as canonical rows. */
export async function genreIds(genre: string | null | undefined): Promise<number[]> {
  const out: number[] = []
  for (const part of clean(genre).split(',')) {
    const name = part.trim()
    if (!name) continue
    const key = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (!key) continue
    const row = await db.genre.upsert({
      where: { key }, update: {}, create: { key, name: name.charAt(0).toUpperCase() + name.slice(1) }, select: { id: true },
    })
    out.push(row.id)
  }
  return [...new Set(out)]
}

/** Links one game to its canonical company and genre rows from its text. */
export async function linkGame(gameId: number): Promise<void> {
  const game = await db.game.findUnique({
    where: { id: gameId }, select: { publisher: true, developer: true, genre: true },
  })
  if (!game) return
  const publisherCompanyId = await companyId(game.publisher)
  const developerCompanyId = await companyId(game.developer)
  const genres = await genreIds(game.genre)
  await db.game.update({
    where: { id: gameId },
    data: {
      publisherCompanyId, developerCompanyId,
      genres: { deleteMany: {}, create: genres.map(genreId => ({ genreId })) },
    },
  })
}

/** Links every game in the library. Idempotent: running it again changes nothing new. */
export async function normalizeCatalog(): Promise<{ games: number }> {
  let cursor = 0
  let games = 0
  for (;;) {
    const batch = await db.game.findMany({
      where: { id: { gt: cursor } }, select: { id: true }, orderBy: { id: 'asc' }, take: 200,
    })
    if (batch.length === 0) break
    for (const g of batch) {
      await linkGame(g.id)
      games++
    }
    cursor = batch[batch.length - 1].id
  }
  return { games }
}
