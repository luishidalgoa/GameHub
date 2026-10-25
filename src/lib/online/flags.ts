import { db } from '@/lib/db'
import { cachedAggregate } from '@/lib/aggregate-cache'
import { parseOnlineProviders } from './providers'

/**
 * Ids de los juegos con juego en línea. Un juego cuenta si tiene Title ID y su
 * plataforma usa un proveedor que lo lista. Las dos tablas pequeñas se cachean 10 min.
 */
export async function onlineGameIds(
  games: { id: number; titleId: string | null; platformId: number }[],
): Promise<Set<number>> {
  const [platforms, support] = await Promise.all([
    cachedAggregate('online:platforms', 10 * 60_000, () =>
      db.platform.findMany({ select: { id: true, onlineProviders: true } })),
    cachedAggregate('online:support', 10 * 60_000, () =>
      db.onlineSupport.findMany({ select: { provider: true, titleId: true } })),
  ])
  const providersOf = new Map(platforms.map(p => [p.id, parseOnlineProviders(p.onlineProviders).map(x => x.key)]))
  const supported = new Set(support.map(s => `${s.provider}|${s.titleId}`))
  const out = new Set<number>()
  for (const g of games) {
    if (!g.titleId) continue
    if ((providersOf.get(g.platformId) ?? []).some(k => supported.has(`${k}|${g.titleId}`))) out.add(g.id)
  }
  return out
}
