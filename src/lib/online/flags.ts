import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { cachedAggregate } from '@/lib/aggregate-cache'
import { comparableNames, normalizeGameTitle, parseOnlineProviders } from './providers'

/**
 * Ids de los juegos con juego en línea. Un juego cuenta si su Title ID, o su nombre,
 * está en la lista de un proveedor que usa su plataforma. Las dos tablas pequeñas se cachean 10 min.
 */
export async function onlineGameIds(
  games: { id: number; title: string; titleId: string | null; platformId: number }[],
): Promise<Set<number>> {
  const [platforms, support] = await Promise.all([
    cachedAggregate('online:platforms', 10 * 60_000, () =>
      db.platform.findMany({ select: { id: true, onlineProviders: true } })),
    cachedAggregate('online:support', 10 * 60_000, () =>
      db.onlineSupport.findMany({ select: { provider: true, titleId: true, name: true } })),
  ])
  const providersOf = new Map(platforms.map(p => [p.id, parseOnlineProviders(p.onlineProviders).map(x => x.key)]))
  const supported = new Set(support.map(s => `${s.provider}|${s.titleId}`))
  const byName = new Set(support.flatMap(s => (s.name ? comparableNames(s.name).map(n => `${s.provider}|${n}`) : [])))
  const out = new Set<number>()
  for (const g of games) {
    const keys = providersOf.get(g.platformId) ?? []
    // Title ID first: it is exact. The name covers the games whose ID was never read from the file.
    const byId = !!g.titleId && keys.some(k => supported.has(`${k}|${g.titleId}`))
    const byTitle = keys.some(k => byName.has(`${k}|${normalizeGameTitle(g.title)}`))
    if (byId || byTitle) out.add(g.id)
  }
  return out
}

/** Ids de los juegos de una consulta que tienen juego en línea. */
export async function onlineIdsIn(where: Prisma.GameWhereInput): Promise<number[]> {
  const games = await db.game.findMany({ where, select: { id: true, title: true, titleId: true, platformId: true } })
  return [...(await onlineGameIds(games))]
}
