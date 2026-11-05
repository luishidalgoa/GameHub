import { db } from '@/lib/db'

/** El magnet de la fuente que sirve a una fila torrent (`torrent:<fuente>:<identidad>`), o null. */
/**
 * Magnet of a torrent game. A game split out of a lot has no key of its own: it
 * downloads the lot's torrent, so its magnet is the one of the lot it came from.
 */
export async function gameMagnet(game: { externalKey: string | null; splitFromId?: number | null }): Promise<string | null> {
  if (game.externalKey) return torrentMagnet(game.externalKey)
  if (!game.splitFromId) return null
  const parent = await db.game.findUnique({ where: { id: game.splitFromId }, select: { externalKey: true } })
  return torrentMagnet(parent?.externalKey ?? null)
}

export async function torrentMagnet(externalKey: string | null): Promise<string | null> {
  if (!externalKey?.startsWith('torrent:')) return null
  const rest = externalKey.slice('torrent:'.length)
  const cut = rest.indexOf(':')
  if (cut < 0) return null
  const source = rest.slice(0, cut)
  const identity = rest.slice(cut + 1)
  const where = identity.startsWith('id:') ? { titleId: identity.slice(3) }
    : identity.startsWith('key:') ? { titleId: null, titleKey: identity.split(':').pop() }
    : { sourceKey: identity.split(':').pop() }
  const row = await db.externalGame.findFirst({ where: { source, gameId: null, ...where }, select: { magnet: true } })
  return row?.magnet ?? null
}
