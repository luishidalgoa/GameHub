import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { serializeBigInt } from '@/lib/serialize'
import { resolveCoverPath } from '@/lib/s3'
import { isAdminSession } from '@/lib/auth'
import { adminGuard } from '@/lib/admin-guard'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
// The public view drops every server path: the game's, its DLC's and the
// platform's scan folder.
function withoutFilePaths<T extends { filePath: string; dlcs: { filePath: string }[]; platform: { scanPath: string } }>(
  { filePath, dlcs, platform, ...rest }: T,
) {
  const { scanPath: _scanPath, ...publicPlatform } = platform
  return { ...rest, platform: publicPlatform, dlcs: dlcs.map(({ filePath: _path, ...dlc }) => dlc) }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  const [game, admin] = await Promise.all([
    db.game.findUnique({ where: { id }, include: { platform: true, dlcs: true } }),
    isAdminSession(),
  ])
  if (!game || (game.isHidden && !admin)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const resolved = { ...game, coverPath: resolveCoverPath(game.coverPath) }
  return NextResponse.json(serializeBigInt(admin ? resolved : withoutFilePaths(resolved)))
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const denied = await adminGuard()
  if (denied) return denied

  const id = parseInt(params.id, 10)
  const body = await req.json()

  // Identity and bookkeeping are the scanner's, not the editor's: a PATCH that
  // could rewrite filePath would point a game at any file on disk.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { platform, dlcs, createdAt, id: _id, platformId, filePath, fileName, fileSize, groupKey, lastSeenAt, sha256, ...data } = body
  if (typeof data.isHidden === 'boolean') data.userHidden = data.isHidden

  // Title ID: 16 hex o nada. Se normaliza aqui y no en el formulario porque
  // esto es lo que acaba en la base de datos y de aqui sale el nombre con el
  // que la tienda sirve el fichero; medio Title ID mal escrito daria una
  // caratula equivocada, que es peor que ninguna.
  if ('titleId' in data) {
    const raw = typeof data.titleId === 'string'
      ? data.titleId.trim().toUpperCase().replace(/[\[\]\s]/g, '')
      : ''
    data.titleId = /^[0-9A-F]{16}$/.test(raw) ? raw : null
  }

  // Null out legacy local cover paths (public/covers/ folder has been removed)
  if (typeof data.coverPath === 'string' && data.coverPath.startsWith('/covers/')) {
    data.coverPath = null
  }

  const game = await db.game.update({ where: { id }, data })
  return NextResponse.json(serializeBigInt(game))
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await adminGuard()
  if (denied) return denied

  const id = parseInt(params.id, 10)
  const downloads = await db.downloadLog.count({ where: { gameId: id } })
  if (downloads > 0) {
    return NextResponse.json(
      { error: 'El juego tiene historial de descargas. Ocúltalo en lugar de borrarlo.' },
      { status: 409 },
    )
  }
  await db.game.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
