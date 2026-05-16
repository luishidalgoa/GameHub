import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { serializeBigInt } from '@/lib/serialize'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  const game = await db.game.findUnique({
    where: { id },
    include: { platform: true, dlcs: true },
  })
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(serializeBigInt(game))
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  const body = await req.json()

  // Strip read-only / relational fields before update
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { platform, dlcs, createdAt, id: _id, ...data } = body

  const game = await db.game.update({ where: { id }, data })
  return NextResponse.json(serializeBigInt(game))
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  await db.game.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
