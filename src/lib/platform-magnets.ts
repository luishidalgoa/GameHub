import { db } from './db'
import { identityOf, torrentKeyOf } from './games/torrent-key'

// Magnets de una plataforma que no es Switch: las entradas de la fuente externa sin
// archivo local. Son las mismas reglas que /api/shop para Switch: solo magnets con
// infohash valido, y nunca lo que el admin quito (lista negra) u oculto.
const BTIH_V1 = /^magnet:\?xt=urn:btih:[0-9a-f]{40}(&|$)/i

export const isBtihMagnet = (m: string | null | undefined): m is string =>
  !!m && BTIH_V1.test(m)

export async function platformMagnetRows(platformId: number) {
  const [rows, blacklisted, hidden] = await Promise.all([
    db.externalGame.findMany({
      where:   { platformId, gameId: null },
      select:  { id: true, title: true, titleId: true, titleKey: true, source: true, sourceKey: true, magnet: true, fileName: true },
      orderBy: { title: 'asc' },
    }),
    db.torrentBlacklist.findMany({
      where:  { platformId },
      select: { identity: true },
    }),
    db.game.findMany({
      where:  { platformId, source: 'torrent', isHidden: true },
      select: { externalKey: true },
    }),
  ])
  const blocked = new Set<string>([
    ...blacklisted.map((b) => b.identity),
    ...hidden.flatMap((g) => torrentKeyOf(g.externalKey)?.identity ?? []),
  ])
  return rows.filter((eg) =>
    isBtihMagnet(eg.magnet) &&
    !blocked.has(identityOf(eg)) &&
    !blocked.has(`topic:${eg.source}:${eg.sourceKey}`))
}

// Cuantos magnets publicables tiene cada plataforma. La lista de plataformas se pide
// cada vez que se abre la pestana, y la cuenta no cambia por minuto: se guarda cinco
// minutos para no releer toda la fuente externa en cada peticion.
const COUNT_TTL_MS = 5 * 60 * 1000
let countCache: { at: number; counts: Map<number, number> } | null = null

export async function platformMagnetCounts(): Promise<Map<number, number>> {
  if (countCache && Date.now() - countCache.at < COUNT_TTL_MS) return countCache.counts
  const [rows, blacklisted, hidden] = await Promise.all([
    db.externalGame.findMany({
      where:  { gameId: null },
      select: { platformId: true, source: true, sourceKey: true, titleId: true, titleKey: true, magnet: true },
    }),
    db.torrentBlacklist.findMany({ select: { platformId: true, identity: true } }),
    db.game.findMany({
      where:  { source: 'torrent', isHidden: true },
      select: { platformId: true, externalKey: true },
    }),
  ])
  const blockedBy = new Map<number, Set<string>>()
  const blockFor = (platformId: number) => {
    let set = blockedBy.get(platformId)
    if (!set) blockedBy.set(platformId, (set = new Set<string>()))
    return set
  }
  for (const b of blacklisted) blockFor(b.platformId).add(b.identity)
  for (const g of hidden) {
    const identity = torrentKeyOf(g.externalKey)?.identity
    if (identity) blockFor(g.platformId).add(identity)
  }
  const counts = new Map<number, number>()
  for (const eg of rows) {
    if (!isBtihMagnet(eg.magnet)) continue
    const blocked = blockedBy.get(eg.platformId)
    if (blocked && (blocked.has(identityOf(eg)) || blocked.has(`topic:${eg.source}:${eg.sourceKey}`)))
      continue
    counts.set(eg.platformId, (counts.get(eg.platformId) ?? 0) + 1)
  }
  countCache = { at: Date.now(), counts }
  return counts
}
