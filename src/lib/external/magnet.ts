import { db } from '@/lib/db'

/** El magnet de la fuente que sirve a una fila torrent (`torrent:<fuente>:<identidad>`), o null. */
export async function torrentMagnet(externalKey: string | null): Promise<string | null> {
  if (!externalKey?.startsWith('torrent:')) return null
  const rest = externalKey.slice('torrent:'.length)
  const cut = rest.indexOf(':')
  if (cut < 0) return null
  const source = rest.slice(0, cut)
  const identity = rest.slice(cut + 1)
  const where = identity.startsWith('id:') ? { titleId: identity.slice(3) }
    : identity.startsWith('key:') ? { titleId: null, titleKey: identity.slice(4) }
    : { sourceKey: identity.split(':').pop() }
  const row = await db.externalGame.findFirst({ where: { source, gameId: null, ...where }, select: { magnet: true } })
  return row?.magnet ?? null
}
