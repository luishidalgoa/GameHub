import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { serializeBigInt } from '@/lib/serialize'
import { resolveCoverPath } from '@/lib/s3'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  const game = await db.game.findUnique({
    where: { id },
    include: { platform: true, dlcs: true },
  })
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const resolved = { ...game, coverPath: resolveCoverPath(game.coverPath) }
  return NextResponse.json(serializeBigInt(resolved))
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  const body = await req.json()

  // Strip read-only / relational fields before update
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { platform, dlcs, createdAt, id: _id, ...data } = body

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
  const id = parseInt(params.id, 10)
  await db.game.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
