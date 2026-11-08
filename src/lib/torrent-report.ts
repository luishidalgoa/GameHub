import { db } from './db'
import { identityOf, torrentKeyOf } from './games/torrent-key'

const INFO_HASH = /^[0-9a-f]{40}$/i

export interface TorrentReport {
  /** Infohash en minúsculas: identifica el torrent, no el juego. */
  infoHash: string
  /** Nombre del torrent tal como lo tiene el cliente, o null si no lo envió. */
  name: string | null
  /** Tamaño total descargado en bytes, o null si no lo envió. */
  size: number | null
}

/** Valida el cuerpo que GameHubNX envía al terminar una descarga torrent. Null si no es válido. */
export function parseTorrentReport(body: unknown): TorrentReport | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (typeof b.infoHash !== 'string' || !INFO_HASH.test(b.infoHash)) return null
  const name = typeof b.name === 'string' && b.name.length > 0 ? b.name.slice(0, 300) : null
  const size = typeof b.size === 'number' && Number.isSafeInteger(b.size) && b.size >= 0 ? b.size : null
  return { infoHash: b.infoHash.toLowerCase(), name, size }
}

export interface ShopGameRef {
  id: number
  fileName: string
  fileSize: bigint
}

/**
 * El juego de la tienda al que pertenece un infohash. Un magnet de la tienda es una fila
 * ExternalGame; si ya casa con un juego local, ese es el juego; si no, es la fila torrent
 * que la sincronización creó con la misma identidad. Un infohash que no es de la tienda
 * devuelve null: la descarga no se cuenta.
 */
export async function shopGameForInfoHash(infoHash: string): Promise<ShopGameRef | null> {
  const rows = await db.externalGame.findMany({
    where: {
      OR: [
        { magnet: { contains: `btih:${infoHash}` } },
        { magnet: { contains: `btih:${infoHash.toUpperCase()}` } },
      ],
    },
    select: { platformId: true, source: true, sourceKey: true, titleId: true, titleKey: true, gameId: true },
    take: 20,
  })
  for (const row of rows) {
    if (row.gameId !== null) {
      const local = await db.game.findUnique({
        where: { id: row.gameId },
        select: { id: true, fileName: true, fileSize: true },
      })
      if (local) return local
      continue
    }
    const identity = identityOf(row)
    const candidates = await db.game.findMany({
      where: { platformId: row.platformId, source: 'torrent', externalKey: { endsWith: identity } },
      select: { id: true, externalKey: true, fileName: true, fileSize: true },
    })
    const torrent = candidates.find(g => torrentKeyOf(g.externalKey)?.identity === identity)
    if (torrent) return torrent
  }
  return null
}
