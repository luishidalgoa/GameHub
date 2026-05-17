import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// DELETE /api/admin/graveyard
// Body: { id: number }  → delete one game
// Body: { purge: true } → delete all isHidden games
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}))

  if (body.purge === true) {
    const hidden = await db.game.findMany({ where: { isHidden: true }, select: { id: true } })
    const ids = hidden.map((g) => g.id)
    if (ids.length === 0) return NextResponse.json({ deleted: 0 })

    await db.$transaction([
      db.downloadLog.deleteMany({ where: { gameId: { in: ids } } }),
      db.game.deleteMany({ where: { id: { in: ids } } }),
    ])
    return NextResponse.json({ deleted: ids.length })
  }

  const id = typeof body.id === 'number' ? body.id : null
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const game = await db.game.findUnique({ where: { id, isHidden: true } })
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.$transaction([
    db.downloadLog.deleteMany({ where: { gameId: id } }),
    db.game.delete({ where: { id } }),
  ])
  return NextResponse.json({ ok: true })
}
