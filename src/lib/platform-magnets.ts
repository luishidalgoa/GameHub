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
      select:  { id: true, title: true, titleId: true, titleKey: true, source: true, sourceKey: true, magnet: true },
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
